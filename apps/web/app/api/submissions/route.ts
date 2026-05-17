import { NextResponse } from "next/server";
import { prisma, resolveActivePatchSeq, withQueryTimeout } from "@researchcrafters/db";
// Stage descriptor for the policy check is stubbed inline — the submission
// route accepts (packageVersionId, stageRef) but the data helper still resolves
// stages through an enrollment id. Wire to a real lookup once submissions are
// fully Prisma-backed.
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import { getStorageEnv, signUploadUrl } from "@/lib/storage";
import {
  submissionInitRequestSchema,
  submissionInitResponseSchema,
} from "@/lib/api-contract";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

/**
 * POST /api/submissions
 *
 * Submission init. The CLI hands us:
 *   - `packageVersionId` and `stageRef` (the stage being submitted)
 *   - `fileCount`, `byteSize`, `sha256` from the local bundle
 *   - optional `stageAttemptId` when the caller already has one open
 *
 * We persist the submission row pre-populated with the bundle metadata and
 * return the contract-shaped `{ submissionId, uploadUrl, uploadHeaders }`
 * payload. The actual signed-URL minting lives in the storage workstream;
 * we keep the placeholder URL shape stable.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return withSpan("api.submissions.init", async () => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = submissionInitRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", reason: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const session = await getSessionFromRequest(req);
  setActiveSpanAttributes({
    "rc.actor": session.userId ?? "anon",
    "rc.package_version": body.packageVersionId,
    "rc.stage": body.stageRef,
    "rc.submission.bytes": body.byteSize,
    "rc.submission.files": body.fileCount,
  });
  if (!session.userId) {
    return NextResponse.json(
      { error: "forbidden", reason: "not_authenticated" },
      { status: 401 },
    );
  }

  // Stage descriptor for the access policy. We don't have an enrollment id
  // here, so we trust the policy to do the right thing with isLocked=false
  // and let it cross-reference packageVersionId+stageRef itself once the
  // policy gains a Prisma-backed lookup. TODO: wire to a stage-by-version
  // helper once submissions are fully Prisma-backed (backlog/06).
  const stage = { isFreePreview: false, isLocked: false };

  const access = await permissions.canAccess({
    user: session,
    packageVersionId: body.packageVersionId,
    stage: {
      ref: body.stageRef,
      isFreePreview: stage.isFreePreview,
      isLocked: stage.isLocked,
    },
    action: "submit_attempt",
  });
  if (!access.allowed) {
    setActiveSpanAttributes({ "rc.access.denied": access.reason });
    return NextResponse.json(
      { error: "forbidden", reason: access.reason },
      { status: denialHttpStatus(access.reason) },
    );
  }

  // Resolve / open the StageAttempt this submission belongs to. The
  // enrollment id is implicit in the user+packageVersion pair; if we can't
  // find one we fall through to a stub stageAttempt to keep the CLI loop
  // unblocked during integration testing.
  let stageAttemptId = body.stageAttemptId;
  if (!stageAttemptId) {
    try {
      const enrollment = await withQueryTimeout(
        prisma.enrollment.findFirst({
          where: {
            userId: session.userId,
            packageVersionId: body.packageVersionId,
          },
          select: { id: true },
          orderBy: { updatedAt: "desc" },
        }),
      );
      if (enrollment) {
        // Freeze the active cosmetic patch generation on the row so
        // analytics, replays, and grade audits can attribute the attempt
        // to a specific patch_seq even after newer patches land.
        // (backlog/06 §Version and Patch Policy line 69.)
        let patchSeq = 0;
        try {
          patchSeq = await resolveActivePatchSeq(body.packageVersionId);
        } catch {
          // best-effort: a missing patches table or transient read error
          // must not block submission init — fall back to base (0).
        }
        const attempt = await withQueryTimeout(
          prisma.stageAttempt.create({
            data: {
              enrollmentId: enrollment.id,
              stageRef: body.stageRef,
              answer: {},
              executionStatus: "queued",
              patchSeq,
            },
            select: { id: true },
          }),
        );
        stageAttemptId = attempt.id;
      }
    } catch {
      // DB unreachable: fall through to a synthesized id below.
    }
  }
  if (!stageAttemptId) {
    stageAttemptId = `att-${Date.now()}`;
  }

  let submissionId = `sub-${Date.now()}`;
  // Pre-compute the bundle object key from the submissionId. Shape is
  // deterministic (`submissions/<id>/bundle.tar`) so the runner workstream
  // can derive the key from the submissionId without a second round trip.
  // We rewrite the key once Prisma assigns the real id below.
  let bundleObjectKey = `submissions/${submissionId}/bundle.tar`;

  try {
    const submission = await withQueryTimeout(
      prisma.submission.create({
        data: {
          stageAttemptId,
          // Persist a placeholder key first; we update it below with the real
          // submission id once Prisma assigns it. This keeps a NOT NULL column
          // satisfied without requiring a two-phase write.
          bundleObjectKey,
          bundleSha: body.sha256.toLowerCase(),
          byteSize: body.byteSize,
          fileCount: body.fileCount,
        },
        select: { id: true },
      }),
    );
    submissionId = submission.id;
    bundleObjectKey = `submissions/${submissionId}/bundle.tar`;
    try {
      await withQueryTimeout(
        prisma.submission.update({
          where: { id: submissionId },
          data: { bundleObjectKey },
        }),
      );
    } catch {
      // best-effort: the placeholder key already round-trips the contract.
    }
  } catch {
    // DB unreachable: keep the synthesized id so the CLI loop can finish
    // round-tripping the contract shape.
    bundleObjectKey = `submissions/${submissionId}/bundle.tar`;
  }

  await track("stage_attempt_submitted", {
    submissionId,
    stageRef: body.stageRef,
  });

  setActiveSpanAttributes({ "rc.submission.id": submissionId });

  const storageEnv = getStorageEnv();
  const { uploadUrl, headers: signedHeaders } = await signUploadUrl({
    bucket: storageEnv.buckets.submissions,
    key: bundleObjectKey,
    expiresIn: 600,
    contentType: "application/octet-stream",
  });

  const responseBody = submissionInitResponseSchema.parse({
    submissionId,
    uploadUrl,
    uploadHeaders: {
      ...signedHeaders,
      "x-rc-submission-id": submissionId,
    },
  });
  return NextResponse.json(responseBody);
  });
}
