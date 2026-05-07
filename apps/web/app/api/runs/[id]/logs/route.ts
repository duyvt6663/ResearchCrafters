import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";
import { permissions } from "@/lib/permissions";
import {
  runLogsResponseSchema,
  type RunLogLine,
} from "@/lib/api-contract";

export const runtime = "nodejs";

type StoredLogLine = {
  ts: string;
  severity: RunLogLine["severity"];
  text: string;
};

/**
 * GET /api/runs/[id]/logs
 *
 * Returns the persisted log lines for a run. Until the runner workstream
 * persists individual lines, this surfaces whatever payload the runner
 * callback wrote into `Run.metricsJson.logs`. When no logs exist yet, returns
 * an empty list rather than 404 — the CLI's `--follow` polling treats an
 * empty response as "still warming up".
 *
 * Honors a `?cursor=` query param for pagination. The cursor is the index
 * (as a string) of the next line to return; the CLI passes the previous
 * response's `nextCursor` through unchanged.
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
        metricsJson: unknown;
        submission: {
          stageAttempt: {
            stageRef: string;
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
          metricsJson: true,
          submission: {
            select: {
              stageAttempt: {
                select: {
                  stageRef: true,
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

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const offset = cursor && /^\d+$/.test(cursor) ? Number.parseInt(cursor, 10) : 0;

  const stored: StoredLogLine[] = readStoredLogs(run?.metricsJson);
  const slice = stored.slice(offset);
  const nextCursor =
    slice.length > 0 ? String(offset + slice.length) : undefined;

  const body = runLogsResponseSchema.parse({
    lines: slice,
    ...(nextCursor ? { nextCursor } : {}),
  });
  return NextResponse.json(body);
}

function readStoredLogs(metrics: unknown): StoredLogLine[] {
  if (!metrics || typeof metrics !== "object") return [];
  const candidate = (metrics as { logs?: unknown }).logs;
  if (!Array.isArray(candidate)) return [];
  const out: StoredLogLine[] = [];
  for (const entry of candidate) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const ts = typeof e["ts"] === "string" ? (e["ts"] as string) : null;
    const text = typeof e["text"] === "string" ? (e["text"] as string) : null;
    const severity =
      e["severity"] === "debug" ||
      e["severity"] === "info" ||
      e["severity"] === "warn" ||
      e["severity"] === "error"
        ? (e["severity"] as RunLogLine["severity"])
        : "info";
    if (ts && text !== null) {
      out.push({ ts, severity, text });
    }
  }
  return out;
}
