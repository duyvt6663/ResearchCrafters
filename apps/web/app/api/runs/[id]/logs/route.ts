import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { getSessionFromRequest } from "@/lib/auth";
import { permissions } from "@/lib/permissions";
import {
  runLogsResponseSchema,
  type RunLogLine,
} from "@/lib/api-contract";
import { getObject, getStorageEnv } from "@/lib/storage";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

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
        logObjectKey: string | null;
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
          logObjectKey: true,
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
  const limitParam = url.searchParams.get("limit");
  const requestedLimit =
    limitParam && /^\d+$/.test(limitParam)
      ? Number.parseInt(limitParam, 10)
      : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(MAX_LIMIT, requestedLimit));

  // Storage strategy: prefer the inline `metricsJson.logs` array (short
  // runs); fall back to fetching the line-delimited JSON object referenced
  // by `Run.logObjectKey` (long runs, mini-experiments).
  let stored: StoredLogLine[] = readStoredLogs(run?.metricsJson);
  if (stored.length === 0 && run?.logObjectKey) {
    try {
      const storageEnv = getStorageEnv();
      const obj = await getObject({
        bucket: storageEnv.buckets.runs,
        key: run.logObjectKey,
      });
      stored = parseNdjsonLogs(obj.body);
    } catch {
      // Storage unavailable: surface an empty page rather than 500 so the
      // CLI's `--follow` poll keeps working.
      stored = [];
    }
  }

  const page = stored.slice(offset, offset + limit);
  const consumed = offset + page.length;
  const hasMore = consumed < stored.length;
  const nextCursor = hasMore ? String(consumed) : undefined;

  const body = runLogsResponseSchema.parse({
    lines: page,
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
    const line = coerceLine(entry);
    if (line) out.push(line);
  }
  return out;
}

function parseNdjsonLogs(text: string): StoredLogLine[] {
  if (!text) return [];
  const out: StoredLogLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Not valid JSON: synthesize a minimal log line so we never drop
      // user-visible runner output silently.
      out.push({
        ts: new Date(0).toISOString(),
        severity: "info",
        text: trimmed,
      });
      continue;
    }
    const line = coerceLine(parsed);
    if (line) out.push(line);
  }
  return out;
}

function coerceLine(entry: unknown): StoredLogLine | null {
  if (!entry || typeof entry !== "object") return null;
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
  if (!ts || text === null) return null;
  return { ts, severity, text };
}
