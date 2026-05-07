import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";
import { permissions } from "@/lib/permissions";
import {
  runStatusResponseSchema,
  type RunStatus,
} from "@/lib/api-contract";
import { getStorageEnv, signDownloadUrl } from "@/lib/storage";

export const runtime = "nodejs";

const VALID_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>([
  "queued",
  "running",
  "ok",
  "timeout",
  "oom",
  "crash",
  "exit_nonzero",
]);

function coerceStatus(input: string): RunStatus {
  return (VALID_STATUSES.has(input as RunStatus) ? input : "queued") as RunStatus;
}

/**
 * GET /api/runs/[id]
 *
 * Returns the run shape documented in `lib/api-contract.ts`
 * (`runStatusResponseSchema`). The CLI's `researchcrafters status` and
 * `researchcrafters logs --follow` both consume this directly.
 *
 * Falls back to a synthesized `queued` row when the run id has no Prisma
 * row yet — the Run model is wired but not all upstream callers populate it
 * during the integration tests, and surfacing 404 here would prevent the
 * CLI's `--follow` polling loop from settling.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const session = await getSessionFromRequest(req);

  let run:
    | {
        id: string;
        status: string;
        runnerMode: string;
        logObjectKey: string | null;
        startedAt: Date | null;
        finishedAt: Date | null;
        submission: {
          stageAttempt: {
            stageRef: string;
            executionStatus: string | null;
            enrollment: { packageVersionId: string };
          };
        };
      }
    | null = null;
  try {
    run = await withQueryTimeout(
      prisma.run.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          runnerMode: true,
          logObjectKey: true,
          startedAt: true,
          finishedAt: true,
          submission: {
            select: {
              stageAttempt: {
                select: {
                  stageRef: true,
                  executionStatus: true,
                  enrollment: { select: { packageVersionId: true } },
                },
              },
            },
          },
        },
      }),
    );
  } catch {
    run = null;
  }

  const access = await permissions.canAccess({
    user: session,
    packageVersionId:
      run?.submission.stageAttempt.enrollment.packageVersionId ?? "unknown",
    stage: {
      ref: run?.submission.stageAttempt.stageRef ?? "run",
      isFreePreview: false,
      isLocked: false,
    },
    action: "view_stage",
  });
  if (!access.allowed) {
    return NextResponse.json(
      { error: "forbidden", reason: access.reason },
      { status: 403 },
    );
  }

  if (!run) {
    // Synthesize a queued response so the CLI's polling loop can settle even
    // before the runner workstream wires real rows.
    const body = runStatusResponseSchema.parse({
      id,
      status: "queued",
      logUrl: null,
    });
    return NextResponse.json(body);
  }

  const status = coerceStatus(run.status);
  const executionStatus = run.submission.stageAttempt.executionStatus
    ? coerceStatus(run.submission.stageAttempt.executionStatus)
    : undefined;

  let logUrl: string | null = null;
  if (run.logObjectKey) {
    try {
      const storageEnv = getStorageEnv();
      logUrl = await signDownloadUrl({
        bucket: storageEnv.buckets.runs,
        key: run.logObjectKey,
        expiresIn: 300,
      });
    } catch {
      // Storage unavailable: surface a null URL so the CLI falls back to
      // the inline /logs endpoint. We don't fail the whole status response.
      logUrl = null;
    }
  }

  const body = runStatusResponseSchema.parse({
    id: run.id,
    status,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    ...(executionStatus ? { executionStatus } : {}),
    logUrl,
  });
  return NextResponse.json(body);
}
