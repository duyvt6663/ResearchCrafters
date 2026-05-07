import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getStage } from "@/lib/data/enrollment";
import { getSessionFromRequest } from "@/lib/auth";
import { denialHttpStatus, permissions } from "@/lib/permissions";
import { track } from "@/lib/telemetry";
import {
  submissionInitRequestSchema,
  submissionInitResponseSchema,
} from "@/lib/api-contract";

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
  if (!session.userId) {
    return NextResponse.json(
      { error: "forbidden", reason: "not_authenticated" },
      { status: 401 },
    );
  }

  // Resolve the stage policy descriptor used by the access policy. The data
  // layer is still stubbed against a fixed catalog, so we accept any stageRef
  // that resolves there — the live data layer landing in 06-data-access
  // replaces this with a Prisma-backed lookup keyed by packageVersionId.
  const stage = getStage(body.stageRef);

  const access = await permissions.canAccess({
    user: session,
    packageVersionId: body.packageVersionId,
    stage: {
      ref: body.stageRef,
      isFreePreview: stage?.isFreePreview ?? false,
      isLocked: stage?.isLocked ?? false,
    },
    action: "submit_attempt",
  });
  if (!access.allowed) {
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
        const attempt = await withQueryTimeout(
          prisma.stageAttempt.create({
            data: {
              enrollmentId: enrollment.id,
              stageRef: body.stageRef,
              answer: {},
              executionStatus: "queued",
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
  try {
    const submission = await withQueryTimeout(
      prisma.submission.create({
        data: {
          stageAttemptId,
          bundleObjectKey: `pending-${stageAttemptId}`,
          bundleSha: body.sha256.toLowerCase(),
          byteSize: body.byteSize,
          fileCount: body.fileCount,
        },
        select: { id: true },
      }),
    );
    submissionId = submission.id;
  } catch {
    // DB unreachable: keep the synthesized id so the CLI loop can finish
    // round-tripping the contract shape.
  }

  await track("stage_attempt_submitted", {
    submissionId,
    stageRef: body.stageRef,
  });

  const responseBody = submissionInitResponseSchema.parse({
    submissionId,
    uploadUrl: `https://stub-storage.local/upload/${submissionId}`,
    uploadHeaders: { "x-rc-submission-id": submissionId },
  });
  return NextResponse.json(responseBody);
}
