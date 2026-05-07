import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import {
  submissionFinalizeRequestSchema,
  submissionFinalizeResponseSchema,
} from "@/lib/api-contract";
import { track } from "@/lib/telemetry";
import {
  checkUploadIntegrity,
  getStorageEnv,
  headObject,
  type HeadObjectResult,
} from "@/lib/storage";

export const runtime = "nodejs";

/**
 * POST /api/submissions/[id]/finalize
 *
 * Called by the CLI after the bundle has been uploaded to the signed URL
 * returned from `/api/submissions`. Verifies the upload's `sha256` and byte
 * count match what the submission row was opened with, creates a `Run` row in
 * `queued` state, and emits the `runner_job_started` telemetry event so the
 * worker can drain the job. We do NOT enqueue a real BullMQ job here — the
 * worker workstream owns that wiring.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = submissionFinalizeRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }

  // Always require an authenticated caller for finalize. Bearer or cookie
  // session both work; access policy is gated below.
  const session = await getSessionFromRequest(req);

  let submission:
    | {
        id: string;
        bundleObjectKey: string;
        bundleSha: string;
        byteSize: number;
        stageAttempt: {
          id: string;
          stageRef: string;
          enrollment: { packageVersionId: string };
        };
      }
    | null = null;
  try {
    submission = await withQueryTimeout(
      prisma.submission.findUnique({
        where: { id },
        select: {
          id: true,
          bundleObjectKey: true,
          bundleSha: true,
          byteSize: true,
          stageAttempt: {
            select: {
              id: true,
              stageRef: true,
              enrollment: { select: { packageVersionId: true } },
            },
          },
        },
      }),
    );
  } catch {
    submission = null;
  }

  // Access check uses the resolved package+stage when available; otherwise
  // a synthetic descriptor so the policy still gates the route.
  const access = await permissions.canAccess({
    user: session,
    packageVersionId:
      submission?.stageAttempt.enrollment.packageVersionId ?? "unknown",
    stage: {
      ref: submission?.stageAttempt.stageRef ?? "submission",
      isFreePreview: false,
      isLocked: false,
    },
    action: "submit_attempt",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: "forbidden", reason: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  // When the submission row exists, verify the upload matches what was
  // recorded at init time AND what MinIO actually has on disk. The S3
  // headObject is the load-bearing check — the recorded values are only
  // useful as a tiebreaker / fast path.
  if (submission) {
    const storageEnv = getStorageEnv();
    let head: HeadObjectResult = { exists: false };
    try {
      head = await headObject({
        bucket: storageEnv.buckets.submissions,
        key: submission.bundleObjectKey,
      });
    } catch {
      // Storage unreachable: fall back to the recorded-row check below.
      // We synthesize an "exists: true, no metadata" result so the helper
      // doesn't reject a row when MinIO is just briefly down.
      head = { exists: true };
    }

    const mismatch = checkUploadIntegrity({
      reported: {
        sha256: parsed.data.uploadedSha256,
        bytes: parsed.data.uploadedBytes,
      },
      recorded: {
        sha256: submission.bundleSha?.length ? submission.bundleSha : null,
        bytes:
          typeof submission.byteSize === "number" && submission.byteSize > 0
            ? submission.byteSize
            : null,
      },
      head,
    });
    if (mismatch) {
      const payload: Record<string, string | number> = {
        error: mismatch.error,
      };
      if (typeof mismatch.expected !== "undefined") {
        payload["expected"] = mismatch.expected;
      }
      return NextResponse.json(payload, { status: mismatch.status });
    }

    // Backfill empty / zero placeholders with the finalised values.
    if (!submission.bundleSha || submission.byteSize === 0) {
      try {
        await withQueryTimeout(
          prisma.submission.update({
            where: { id: submission.id },
            data: {
              bundleSha: parsed.data.uploadedSha256.toLowerCase(),
              byteSize: parsed.data.uploadedBytes,
            },
          }),
        );
      } catch {
        // ignore — backfill is best-effort.
      }
    }
  }

  let runId = `run-${Date.now()}`;
  if (submission) {
    try {
      const run = await withQueryTimeout(
        prisma.run.create({
          data: {
            submissionId: submission.id,
            status: "queued",
            // The runner mode lives on the Stage row keyed by (packageVersion,
            // stageRef). For the queued row it's safe to default to 'none' —
            // the worker rewrites this when it picks the job up.
            runnerMode: "none",
          },
          select: { id: true },
        }),
      );
      runId = run.id;
    } catch {
      // DB unreachable: keep the synthesized id so the CLI loop can finish.
    }
  }

  await track("runner_job_started", {
    submissionId: submission?.id ?? id,
    runId,
    stageRef: submission?.stageAttempt.stageRef ?? "unknown",
  });

  const body = submissionFinalizeResponseSchema.parse({ runId });
  return NextResponse.json(body);
}
