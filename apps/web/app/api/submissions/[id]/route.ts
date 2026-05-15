import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";
import { deleteObject, getStorageEnv } from "@/lib/storage";
import { track } from "@/lib/telemetry";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

/**
 * DELETE /api/submissions/[id]
 *
 * Learner-initiated deletion of a single submission. Backs the Security
 * backlog item "Support user deletion of submissions" — the time-based bundle
 * purger in `apps/web/lib/submission-retention.ts` handles passive expiry;
 * this route handles the active, learner-driven removal.
 *
 * Ownership: the caller must be the user who owns the parent enrollment.
 * Anonymous and cross-user requests get the same 404 so the route doesn't
 * leak the existence of someone else's submission ids.
 *
 * Order of effects (mirrors the per-row segment of ACCOUNT_DELETE_PLAN):
 *   1. Best-effort purge of the S3 bundle (submissions bucket).
 *   2. Best-effort purge of each Run's logObjectKey (runs bucket).
 *   3. DB transaction: delete dependent Runs, then the Submission row.
 *      Grade rows survive with `submissionId` nulled via `SetNull` so the
 *      learner's pass/fail history stays intact for audit and UI.
 *
 * Telemetry: emits `submission_deleted` with counts so we can monitor abuse
 * patterns (e.g. mass-delete sweeps that should trigger rate limiting).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  return withSpan("api.submissions.delete", async () => {
    setActiveSpanAttributes({ "rc.submission.id": id });

    const session = await getSessionFromRequest(req);
    if (!session.userId) {
      return NextResponse.json(
        { error: "not_authenticated" },
        { status: 401 },
      );
    }
    setActiveSpanAttributes({ "rc.actor": session.userId });

    let submission:
      | {
          id: string;
          bundleObjectKey: string;
          stageAttempt: {
            enrollment: { userId: string };
          };
          runs: Array<{ id: string; logObjectKey: string | null }>;
        }
      | null = null;
    try {
      submission = await withQueryTimeout(
        prisma.submission.findUnique({
          where: { id },
          select: {
            id: true,
            bundleObjectKey: true,
            stageAttempt: {
              select: {
                enrollment: { select: { userId: true } },
              },
            },
            runs: {
              select: { id: true, logObjectKey: true },
            },
          },
        }),
      );
    } catch {
      // DB unreachable — fail closed with 503 so the CLI can retry instead of
      // assuming the row is gone.
      return NextResponse.json(
        { error: "database_unavailable" },
        { status: 503 },
      );
    }

    if (!submission) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    if (submission.stageAttempt.enrollment.userId !== session.userId) {
      // Same shape as the unauthenticated-row case so we don't leak existence
      // of someone else's submission ids.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const storageEnv = getStorageEnv();

    // Best-effort blob purges. `deleteObject` already treats 404/NoSuchKey as
    // success, so a previously-purged bundle (e.g. retention sweep already
    // ran) is not an error path. Anything else propagates and aborts before
    // we touch the DB so a half-deleted state isn't created.
    if (submission.bundleObjectKey && submission.bundleObjectKey.length > 0) {
      try {
        await deleteObject({
          bucket: storageEnv.buckets.submissions,
          key: submission.bundleObjectKey,
        });
      } catch (err) {
        return NextResponse.json(
          {
            error: "storage_unavailable",
            stage: "bundle",
            message: err instanceof Error ? err.message : String(err),
          },
          { status: 502 },
        );
      }
    }

    let runLogsDeleted = 0;
    for (const run of submission.runs) {
      if (!run.logObjectKey || run.logObjectKey.length === 0) continue;
      try {
        await deleteObject({
          bucket: storageEnv.buckets.runs,
          key: run.logObjectKey,
        });
        runLogsDeleted += 1;
      } catch (err) {
        return NextResponse.json(
          {
            error: "storage_unavailable",
            stage: "run_log",
            runId: run.id,
            message: err instanceof Error ? err.message : String(err),
          },
          { status: 502 },
        );
      }
    }

    try {
      await withQueryTimeout(
        prisma.$transaction([
          prisma.run.deleteMany({ where: { submissionId: id } }),
          prisma.submission.delete({ where: { id } }),
        ]),
      );
    } catch (err) {
      return NextResponse.json(
        {
          error: "delete_failed",
          message: err instanceof Error ? err.message : String(err),
        },
        { status: 500 },
      );
    }

    await track("submission_deleted", {
      submissionId: id,
      userId: session.userId,
      runsDeleted: submission.runs.length,
      runLogsDeleted,
      hadBundle:
        submission.bundleObjectKey != null &&
        submission.bundleObjectKey.length > 0,
    });

    setActiveSpanAttributes({
      "rc.submission.runs_deleted": submission.runs.length,
      "rc.submission.run_logs_deleted": runLogsDeleted,
    });

    return NextResponse.json({ deleted: true }, { status: 200 });
  });
}
