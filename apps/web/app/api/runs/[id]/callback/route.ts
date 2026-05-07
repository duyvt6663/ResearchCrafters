import { NextResponse } from "next/server";
import { prisma, withQueryTimeout } from "@researchcrafters/db";
import { track } from "@/lib/telemetry";
import { setActiveSpanAttributes, withSpan } from "@/lib/tracing";

export const runtime = "nodejs";

/**
 * POST /api/runs/[id]/callback
 *
 * Service-to-service callback used by the runner (or the worker, in dev) to
 * push terminal Run state, log pointers, and metric snapshots back into
 * Postgres without going through a learner-scoped session.
 *
 * Auth: requires `X-Runner-Secret: <env.RUNNER_CALLBACK_SECRET>`. We intentionally
 * do NOT route this through `permissions.canAccess` — the caller is a backend
 * worker, not a learner. Any caller missing or mismatching the secret gets 401.
 *
 * In dev, `RUNNER_CALLBACK_SECRET` defaults to `dev-runner-secret` so the
 * single-host stack works without extra config. Production must set the env var
 * to a long random string. See `.env.example` for the canonical variable name.
 *
 * Body shape (all fields optional except `status`):
 *   {
 *     status: 'queued' | 'running' | 'ok' | 'timeout' | 'oom' | 'crash' | 'exit_nonzero',
 *     executionStatus?: same union,
 *     metrics?: Record<string, unknown>,  // merged into Run.metricsJson
 *     logsUrl?: string,                   // copied to Run.logObjectKey
 *     gradeId?: string,                   // mirrored onto the StageAttempt
 *   }
 *
 * Persists:
 *   - Run.status, Run.startedAt (if not already set), Run.finishedAt (on terminal)
 *   - Run.logObjectKey (when logsUrl present)
 *   - Run.metricsJson (merged with existing payload)
 *   - StageAttempt.executionStatus, StageAttempt.gradeId (when set)
 */

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "ok",
  "timeout",
  "oom",
  "crash",
  "exit_nonzero",
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "running",
  "ok",
  "timeout",
  "oom",
  "crash",
  "exit_nonzero",
]);

function expectedSecret(): string {
  return process.env["RUNNER_CALLBACK_SECRET"] ?? "dev-runner-secret";
}

function authorize(req: Request): boolean {
  const got = req.headers.get("x-runner-secret");
  if (!got) return false;
  // Constant-time compare on equal-length strings; fall back to a length check
  // first so we don't leak length via early-return.
  const want = expectedSecret();
  if (got.length !== want.length) return false;
  let mismatch = 0;
  for (let i = 0; i < got.length; i += 1) {
    mismatch |= got.charCodeAt(i) ^ want.charCodeAt(i);
  }
  return mismatch === 0;
}

interface CallbackBody {
  status: string;
  executionStatus?: string;
  metrics?: Record<string, unknown>;
  logsUrl?: string;
  gradeId?: string;
}

function parseBody(raw: unknown): CallbackBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = typeof r["status"] === "string" ? r["status"] : null;
  if (!status || !VALID_STATUSES.has(status)) return null;
  const out: CallbackBody = { status };
  if (typeof r["executionStatus"] === "string") {
    if (VALID_STATUSES.has(r["executionStatus"])) {
      out.executionStatus = r["executionStatus"];
    } else {
      return null;
    }
  }
  if (r["metrics"] && typeof r["metrics"] === "object" && !Array.isArray(r["metrics"])) {
    out.metrics = r["metrics"] as Record<string, unknown>;
  }
  if (typeof r["logsUrl"] === "string" && r["logsUrl"].length > 0) {
    out.logsUrl = r["logsUrl"];
  }
  if (typeof r["gradeId"] === "string" && r["gradeId"].length > 0) {
    out.gradeId = r["gradeId"];
  }
  return out;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  return withSpan("api.runs.callback", async () => {
  setActiveSpanAttributes({ "rc.run.id": id });

  if (!authorize(req)) {
    setActiveSpanAttributes({ "rc.callback.unauthorized": true });
    return NextResponse.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: {
          // Hint for ops: the runner must present this header.
          "WWW-Authenticate": 'X-Runner-Secret realm="runner"',
        },
      },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { error: "invalid_body", required: ["status"] },
      { status: 400 },
    );
  }

  setActiveSpanAttributes({
    "rc.callback.status": body.status,
    ...(body.executionStatus
      ? { "rc.callback.exec_status": body.executionStatus }
      : {}),
  });

  // Pull the existing Run row so we can merge metrics rather than clobber
  // anything the worker already wrote.
  let existing:
    | {
        id: string;
        metricsJson: unknown;
        startedAt: Date | null;
        submission: { stageAttemptId: string };
      }
    | null = null;
  try {
    existing = await withQueryTimeout(
      prisma.run.findUnique({
        where: { id },
        select: {
          id: true,
          metricsJson: true,
          startedAt: true,
          submission: { select: { stageAttemptId: true } },
        },
      }),
    );
  } catch {
    existing = null;
  }

  if (!existing) {
    return NextResponse.json({ error: "not_found", runId: id }, { status: 404 });
  }

  const now = new Date();
  const isTerminal = TERMINAL_STATUSES.has(body.status);

  const mergedMetrics: Record<string, unknown> = (() => {
    const base =
      existing.metricsJson && typeof existing.metricsJson === "object" && !Array.isArray(existing.metricsJson)
        ? (existing.metricsJson as Record<string, unknown>)
        : {};
    if (!body.metrics) return base;
    return { ...base, ...body.metrics };
  })();

  // Build the update payload as a plain record. We cast at the call site
  // because Prisma's `RunUpdateInput` for JSON columns is a union of strict
  // shapes that does not accept the `unknown`/`Record<string, unknown>` we
  // need to merge incrementally.
  const updateData: Record<string, unknown> = { status: body.status };
  if (!existing.startedAt) {
    updateData["startedAt"] = now;
  }
  if (isTerminal) {
    updateData["finishedAt"] = now;
  }
  if (body.logsUrl) {
    updateData["logObjectKey"] = body.logsUrl;
  }
  if (body.metrics) {
    updateData["metricsJson"] = mergedMetrics;
  }

  try {
    await withQueryTimeout(
      prisma.run.update({
        where: { id },
        data: updateData as Parameters<typeof prisma.run.update>[0]["data"],
      }),
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "persist_failed",
        reason: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }

  // Mirror execution status + grade pointer onto StageAttempt for
  // fast lookups (the web stage-attempt page reads from StageAttempt).
  if (body.executionStatus || body.gradeId) {
    try {
      const attemptUpdate: { executionStatus?: string; gradeId?: string } = {};
      if (body.executionStatus) attemptUpdate.executionStatus = body.executionStatus;
      if (body.gradeId) attemptUpdate.gradeId = body.gradeId;
      await withQueryTimeout(
        prisma.stageAttempt.update({
          where: { id: existing.submission.stageAttemptId },
          data: attemptUpdate,
        }),
      );
    } catch {
      // Stage-attempt mirror is a best-effort projection of Run state; we
      // don't fail the callback when it stutters because the Run row is the
      // source of truth.
    }
  }

  await track("runner_job_completed", {
    runId: id,
    status: body.status,
    ...(body.executionStatus ? { executionStatus: body.executionStatus } : {}),
    ...(body.gradeId ? { gradeId: body.gradeId } : {}),
  });

  return NextResponse.json({ ok: true, runId: id });
  });
}
