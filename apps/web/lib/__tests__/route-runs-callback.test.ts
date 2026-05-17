import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression suite for `app/api/runs/[id]/callback/route.ts`.
 *
 * The route is the runner→web persistence path. It carries TWO
 * security-critical invariants:
 *
 *   1. Service auth via `X-Runner-Secret`. An anonymous caller MUST NOT
 *      be able to flip `Run.status`, mutate `metricsJson`, or shadow logs.
 *   2. Body validation. Bad input must 400 with a structured error, never
 *      500 — and never silently drop fields onto the row.
 *
 * The QA api-qa-report listed unauthenticated callback access as a HIGH
 * finding. These tests pin both fixes and the constant-time compare so a
 * regression surfaces before merge.
 */

const mocks = vi.hoisted(() => ({
  runFindUnique: vi.fn(),
  runUpdate: vi.fn(),
  stageAttemptUpdate: vi.fn(),
  nodeTraversalFindFirst: vi.fn(),
  withQueryTimeout: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    run: {
      findUnique: mocks.runFindUnique,
      update: mocks.runUpdate,
    },
    stageAttempt: {
      update: mocks.stageAttemptUpdate,
    },
    nodeTraversal: {
      findFirst: mocks.nodeTraversalFindFirst,
    },
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

import { POST } from "../../app/api/runs/[id]/callback/route";

const ORIG_SECRET = process.env["RUNNER_CALLBACK_SECRET"];

beforeEach(() => {
  mocks.runFindUnique.mockReset();
  mocks.runUpdate.mockReset();
  mocks.stageAttemptUpdate.mockReset();
  mocks.nodeTraversalFindFirst.mockReset();
  mocks.withQueryTimeout.mockReset();
  mocks.track.mockReset();
  // Default: identity wrapper around the Prisma promise.
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  // Default: a queued run row exists for the id under test, with the
  // submission/stageAttempt projection the route selects so the unlock
  // emit path has the (enrollment, stage, branch) tuple it needs.
  mocks.runFindUnique.mockResolvedValue({
    id: "run-1",
    status: "queued",
    startedAt: null,
    finishedAt: null,
    metricsJson: null,
    logObjectKey: null,
    submission: {
      stageAttemptId: "sa-1",
      stageAttempt: {
        enrollmentId: "enr-1",
        stageRef: "stage-1",
        branchId: "branch-1",
      },
    },
  });
  mocks.runUpdate.mockResolvedValue({ id: "run-1" });
  mocks.stageAttemptUpdate.mockResolvedValue({ id: "sa-1" });
  mocks.nodeTraversalFindFirst.mockResolvedValue({ decisionNodeId: "dn-1" });
  process.env["RUNNER_CALLBACK_SECRET"] = "test-shared-secret";
});

afterEach(() => {
  if (ORIG_SECRET === undefined) {
    delete process.env["RUNNER_CALLBACK_SECRET"];
  } else {
    process.env["RUNNER_CALLBACK_SECRET"] = ORIG_SECRET;
  }
});

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
  id = "run-1",
): { req: Request; ctx: { params: Promise<{ id: string }> } } {
  const req = new Request(`http://localhost/api/runs/${id}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

describe("POST /api/runs/[id]/callback", () => {
  it("returns 401 when X-Runner-Secret is missing (anonymous callback)", async () => {
    const { req, ctx } = makeRequest({ status: "ok" });
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
    // The WWW-Authenticate hint is mandatory for ops debugging.
    expect(res.headers.get("www-authenticate")).toContain("X-Runner-Secret");
    // No DB writes.
    expect(mocks.runUpdate).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret (constant-time compare path)", async () => {
    const { req, ctx } = makeRequest(
      { status: "ok" },
      { "x-runner-secret": "wrong-secret-of-similar-length" },
    );
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
    expect(mocks.runUpdate).not.toHaveBeenCalled();
  });

  it("returns 401 when the secret length differs (length-based short-circuit)", async () => {
    const { req, ctx } = makeRequest(
      { status: "ok" },
      { "x-runner-secret": "x" },
    );
    const res = await POST(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 invalid_json on a malformed body, even with the right secret", async () => {
    const req = new Request("http://localhost/api/runs/run-1/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-runner-secret": "test-shared-secret",
      },
      body: "not-json",
    });
    const ctx = { params: Promise.resolve({ id: "run-1" }) };
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_json");
    expect(mocks.runUpdate).not.toHaveBeenCalled();
  });

  it("rejects a body whose status is not in the runner-lifecycle whitelist", async () => {
    const { req, ctx } = makeRequest(
      { status: "totally-fake-state" },
      { "x-runner-secret": "test-shared-secret" },
    );
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
  });

  it("persists status + metrics + logsUrl + finishedAt on a terminal-status callback", async () => {
    const { req, ctx } = makeRequest(
      {
        status: "ok",
        executionStatus: "ok",
        metrics: { cpu_ms: 1234, peak_rss_mb: 256 },
        logsUrl: "runs/run-1/logs.ndjson",
        gradeId: "grade-1",
      },
      { "x-runner-secret": "test-shared-secret" },
    );
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    // The Prisma update was called with merged data.
    expect(mocks.runUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mocks.runUpdate.mock.calls[0]?.[0];
    expect(updateArg).toBeDefined();
    expect(updateArg.where).toEqual({ id: "run-1" });
    const data = updateArg.data as Record<string, unknown>;
    expect(data["status"]).toBe("ok");
    // metricsJson should be a JSON-mergeable object containing the new
    // metrics. The route can either store the raw object or wrap it.
    expect(JSON.stringify(data["metricsJson"] ?? data["metrics"])).toContain(
      "cpu_ms",
    );
    // Telemetry fired.
    expect(mocks.track).toHaveBeenCalledWith(
      "runner_job_completed",
      expect.objectContaining({ runId: "run-1" }),
    );
  });

  it("emits branch_feedback_unlocked once the runner finishes ok with a grade", async () => {
    const { req, ctx } = makeRequest(
      { status: "ok", gradeId: "grade-1" },
      { "x-runner-secret": "test-shared-secret" },
    );
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    expect(mocks.nodeTraversalFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enrollmentId: "enr-1", branchId: "branch-1" },
      }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      "branch_feedback_unlocked",
      expect.objectContaining({
        enrollmentId: "enr-1",
        stageRef: "stage-1",
        decisionNodeId: "dn-1",
        branchId: "branch-1",
      }),
    );
  });

  it("does NOT emit branch_feedback_unlocked when the runner did not finish ok", async () => {
    const { req, ctx } = makeRequest(
      { status: "timeout", gradeId: "grade-1" },
      { "x-runner-secret": "test-shared-secret" },
    );
    await POST(req, ctx);
    const calls = mocks.track.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("branch_feedback_unlocked");
  });

  it("does NOT emit branch_feedback_unlocked when no branch was selected", async () => {
    mocks.runFindUnique.mockResolvedValueOnce({
      id: "run-1",
      status: "queued",
      startedAt: null,
      finishedAt: null,
      metricsJson: null,
      logObjectKey: null,
      submission: {
        stageAttemptId: "sa-1",
        stageAttempt: {
          enrollmentId: "enr-1",
          stageRef: "stage-1",
          branchId: null,
        },
      },
    });
    const { req, ctx } = makeRequest(
      { status: "ok", gradeId: "grade-1" },
      { "x-runner-secret": "test-shared-secret" },
    );
    await POST(req, ctx);
    expect(mocks.nodeTraversalFindFirst).not.toHaveBeenCalled();
    const calls = mocks.track.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain("branch_feedback_unlocked");
  });

  it("does NOT stamp finishedAt for non-terminal `running` status", async () => {
    const { req, ctx } = makeRequest(
      { status: "running" },
      { "x-runner-secret": "test-shared-secret" },
    );
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const updateArg = mocks.runUpdate.mock.calls[0]?.[0];
    const data = updateArg.data as Record<string, unknown>;
    expect(data["status"]).toBe("running");
    expect(data["finishedAt"]).toBeUndefined();
  });
});
