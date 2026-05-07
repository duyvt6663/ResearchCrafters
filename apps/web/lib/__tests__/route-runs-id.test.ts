import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/runs/[id]/route.ts`.
 *
 * Pins:
 *  - Returns the contract `runStatusResponseSchema` shape (the CLI parses it
 *    on every poll tick).
 *  - 403 on permissions denial (auth gate even on read).
 *  - Synthesized `queued` row when the DB returns null (so the CLI's poll
 *    loop can settle even before the runner workstream writes real rows).
 *  - `logUrl` is signed only when `logObjectKey` is set; `null` otherwise.
 */

const mocks = vi.hoisted(() => ({
  runFindUnique: vi.fn(),
  withQueryTimeout: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  signDownloadUrl: vi.fn(),
  getStorageEnv: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: { run: { findUnique: mocks.runFindUnique } },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/permissions", () => ({
  permissions: { canAccess: mocks.canAccess },
}));

vi.mock("@/lib/storage", () => ({
  signDownloadUrl: mocks.signDownloadUrl,
  getStorageEnv: mocks.getStorageEnv,
}));

import { GET } from "../../app/api/runs/[id]/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
  mocks.canAccess.mockResolvedValue({ allowed: true });
  mocks.getStorageEnv.mockReturnValue({
    buckets: { runs: "researchcrafters-runs" },
  });
  mocks.signDownloadUrl.mockResolvedValue(
    "https://signed.example/runs/run-1/logs.ndjson",
  );
});

function makeCtx(id: string): { req: Request; ctx: { params: Promise<{ id: string }> } } {
  return {
    req: new Request(`http://localhost/api/runs/${id}`),
    ctx: { params: Promise.resolve({ id }) },
  };
}

describe("GET /api/runs/[id]", () => {
  it("returns the contract shape on a real Run row", async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: "run-1",
      status: "ok",
      runnerMode: "test",
      logObjectKey: "runs/run-1/logs.ndjson",
      startedAt: new Date("2026-05-08T00:00:00Z"),
      finishedAt: new Date("2026-05-08T00:01:00Z"),
      submission: {
        stageAttempt: {
          stageRef: "S001",
          executionStatus: "ok",
          enrollment: { packageVersionId: "pv-1" },
        },
      },
    });
    const { req, ctx } = makeCtx("run-1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("run-1");
    expect(body.status).toBe("ok");
    expect(typeof body.startedAt === "string" || body.startedAt === null).toBe(
      true,
    );
    // logUrl was signed because logObjectKey is set.
    expect(body.logUrl).toMatch(/^https:\/\/signed\.example/);
    expect(mocks.signDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: "runs/run-1/logs.ndjson" }),
    );
  });

  it("returns logUrl: null when the run has no logObjectKey yet", async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: "run-2",
      status: "running",
      runnerMode: "test",
      logObjectKey: null,
      startedAt: new Date("2026-05-08T00:00:00Z"),
      finishedAt: null,
      submission: {
        stageAttempt: {
          stageRef: "S001",
          executionStatus: null,
          enrollment: { packageVersionId: "pv-1" },
        },
      },
    });
    const { req, ctx } = makeCtx("run-2");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logUrl).toBeNull();
    expect(mocks.signDownloadUrl).not.toHaveBeenCalled();
  });

  it("returns 403 when permissions.canAccess denies", async () => {
    mocks.runFindUnique.mockResolvedValue({
      id: "run-3",
      status: "ok",
      runnerMode: "test",
      logObjectKey: null,
      startedAt: null,
      finishedAt: null,
      submission: {
        stageAttempt: {
          stageRef: "S002",
          executionStatus: null,
          enrollment: { packageVersionId: "pv-paid" },
        },
      },
    });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });
    const { req, ctx } = makeCtx("run-3");
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
  });

  it("synthesizes a queued response when the run row doesn't exist (CLI poll-loop survival)", async () => {
    mocks.runFindUnique.mockResolvedValue(null);
    const { req, ctx } = makeCtx("run-not-yet-written");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("run-not-yet-written");
    expect(body.status).toBe("queued");
    expect(body.logUrl).toBeNull();
  });

  it("survives a Prisma error (also synthesizes queued, doesn't 5xx)", async () => {
    mocks.runFindUnique.mockRejectedValue(new Error("connection lost"));
    const { req, ctx } = makeCtx("run-prisma-down");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("queued");
  });
});
