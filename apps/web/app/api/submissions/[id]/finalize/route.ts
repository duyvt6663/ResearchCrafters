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
import { getProducerQueue } from "@researchcrafters/worker/admin";
import { SUBMISSION_RUN_QUEUE } from "@researchcrafters/worker";

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

  // Resolve the stage's runnerMode (mirrored on the Stage row) so we can both
  // stamp the Run row truthfully AND give the BullMQ payload the dispatch hint
  // it needs. Defaults to `none` when the lookup fails — the worker's
  // submission-run handler accepts `none` and short-circuits to ok.
  let runnerMode: "test" | "replay" | "mini_experiment" | "none" = "none";
  if (submission) {
    try {
      const stage = await withQueryTimeout(
        prisma.stage.findFirst({
          where: {
            packageVersionId: submission.stageAttempt.enrollment.packageVersionId,
            stageId: submission.stageAttempt.stageRef,
          },
          select: { runnerMode: true },
        }),
      );
      const candidate = stage?.runnerMode;
      if (
        candidate === "test" ||
        candidate === "replay" ||
        candidate === "mini_experiment" ||
        candidate === "none"
      ) {
        runnerMode = candidate;
      }
    } catch {
      // Best-effort: leave runnerMode at 'none' so the worker exits fast.
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
            // Mirror the Stage's runnerMode so /api/runs/:id reflects the real
            // dispatch shape immediately, even before the worker picks the job.
            runnerMode,
          },
          select: { id: true },
        }),
      );
      runId = run.id;
    } catch {
      // DB unreachable: keep the synthesized id so the CLI loop can finish.
    }
  }

  // Enqueue the submission_run job. The job id is pinned to `runId` so a
  // retry of the enqueue (e.g. transient Redis failure) cannot double-execute
  // — BullMQ deduplicates on jobId at the queue layer.
  let queueDeferred = false;
  if (submission) {
    try {
      const queue = await getProducerQueue(SUBMISSION_RUN_QUEUE);
      await queue.add(
        SUBMISSION_RUN_QUEUE,
        {
          runId,
          submissionId: submission.id,
          packageVersionId:
            submission.stageAttempt.enrollment.packageVersionId,
          stageRef: submission.stageAttempt.stageRef,
          runnerMode,
        },
        { jobId: runId },
      );
    } catch (err) {
      // Redis is allowed to be down in dev (port 6379 collisions on the host
      // tier). Leave the Run row in `queued` so a worker can pick it up the
      // moment the broker is back, and surface `queueDeferred` so the CLI can
      // distinguish "queued and ready" from "queued, broker offline".
      queueDeferred = true;

      console.warn(
        JSON.stringify({
          kind: "submission_run_enqueue_failed",
          runId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  await track("runner_job_started", {
    submissionId: submission?.id ?? id,
    runId,
    stageRef: submission?.stageAttempt.stageRef ?? "unknown",
    queueDeferred,
  });

  const body = submissionFinalizeResponseSchema.parse({ runId });
  // Surface the queue degradation flag as an extra field. The contract schema
  // is `.strict()` so we wrap it to keep the canonical fields intact while
  // adding the optional flag the CLI can branch on.
  if (queueDeferred) {
    return NextResponse.json({ ...body, queueDeferred: true });
  }
  return NextResponse.json(body);
}
