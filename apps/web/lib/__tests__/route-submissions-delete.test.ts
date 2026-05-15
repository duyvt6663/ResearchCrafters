import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/submissions/[id]/route.ts` DELETE handler.
 *
 * Pins:
 *  - 401 when caller is unauthenticated.
 *  - 404 when the submission row doesn't exist.
 *  - 404 when the row exists but belongs to a different user (no existence
 *    leak — same shape as the missing-row case).
 *  - Happy path:
 *      * S3 bundle purged from the submissions bucket.
 *      * Each Run's logObjectKey purged from the runs bucket.
 *      * Runs deleted before the Submission row (FK is Restrict).
 *      * Grade rows are NOT touched (SetNull handles the column).
 *      * `submission_deleted` telemetry event fires with run + log counts.
 *  - Idempotent re-delete: when the row is already gone, a second DELETE
 *    returns 404 (not 500) so retries are safe.
 *  - Storage failure on bundle purge → 502 without DB writes.
 *  - DB unreachable on lookup → 503.
 */

const mocks = vi.hoisted(() => ({
  submissionFindUnique: vi.fn(),
  runDeleteMany: vi.fn(),
  submissionDelete: vi.fn(),
  prismaTransaction: vi.fn(),
  withQueryTimeout: vi.fn(),
  getSessionFromRequest: vi.fn(),
  track: vi.fn(),
  deleteObject: vi.fn(),
  getStorageEnv: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    submission: {
      findUnique: mocks.submissionFindUnique,
      delete: mocks.submissionDelete,
    },
    run: { deleteMany: mocks.runDeleteMany },
    $transaction: mocks.prismaTransaction,
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

vi.mock("@/lib/storage", () => ({
  deleteObject: mocks.deleteObject,
  getStorageEnv: mocks.getStorageEnv,
}));

import { DELETE } from "../../app/api/submissions/[id]/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-owner" });
  mocks.deleteObject.mockResolvedValue({ deleted: true });
  mocks.getStorageEnv.mockReturnValue({
    endpoint: "http://localhost:9000",
    region: "us-east-1",
    accessKeyId: "x",
    secretAccessKey: "x",
    buckets: {
      submissions: "researchcrafters-submissions",
      runs: "researchcrafters-runs",
      packages: "researchcrafters-packages",
      shareCards: "researchcrafters-share-cards",
    },
  });
  // Default: the transaction wrapper resolves with the per-op results.
  mocks.prismaTransaction.mockResolvedValue([{ count: 1 }, { id: "sub-1" }]);
  mocks.runDeleteMany.mockReturnValue({ kind: "deleteMany.run" });
  mocks.submissionDelete.mockReturnValue({ kind: "delete.submission" });
  mocks.track.mockResolvedValue(undefined);
});

function makeReq(id: string): {
  req: Request;
  ctx: { params: Promise<{ id: string }> };
} {
  const req = new Request(`http://localhost/api/submissions/${id}`, {
    method: "DELETE",
  });
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

function seedSubmission(overrides: {
  ownerUserId?: string;
  bundleObjectKey?: string;
  runs?: Array<{ id: string; logObjectKey: string | null }>;
}): void {
  mocks.submissionFindUnique.mockResolvedValue({
    id: "sub-1",
    bundleObjectKey:
      overrides.bundleObjectKey ?? "submissions/sub-1/bundle.tar",
    stageAttempt: {
      enrollment: { userId: overrides.ownerUserId ?? "u-owner" },
    },
    runs: overrides.runs ?? [],
  });
}

describe("DELETE /api/submissions/[id]", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    const { req, ctx } = makeReq("sub-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(401);
    expect(mocks.submissionFindUnique).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 when no submission row matches the id", async () => {
    mocks.submissionFindUnique.mockResolvedValue(null);
    const { req, ctx } = makeReq("sub-missing");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when the submission belongs to another user — no existence leak", async () => {
    seedSubmission({ ownerUserId: "u-other" });
    const { req, ctx } = makeReq("sub-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("happy path: purges bundle + run logs, deletes Runs then Submission, fires telemetry", async () => {
    seedSubmission({
      runs: [
        { id: "run-1", logObjectKey: "runs/run-1/log.ndjson" },
        { id: "run-2", logObjectKey: null },
        { id: "run-3", logObjectKey: "runs/run-3/log.ndjson" },
      ],
    });

    const { req, ctx } = makeReq("sub-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    // S3 calls: 1 bundle + 2 run logs (run-2 has no key).
    expect(mocks.deleteObject).toHaveBeenCalledTimes(3);
    const calls = mocks.deleteObject.mock.calls.map((c) => c[0]);
    expect(calls[0]).toEqual({
      bucket: "researchcrafters-submissions",
      key: "submissions/sub-1/bundle.tar",
    });
    expect(calls[1]).toEqual({
      bucket: "researchcrafters-runs",
      key: "runs/run-1/log.ndjson",
    });
    expect(calls[2]).toEqual({
      bucket: "researchcrafters-runs",
      key: "runs/run-3/log.ndjson",
    });

    // DB: single transaction containing [runs.deleteMany, submission.delete].
    expect(mocks.runDeleteMany).toHaveBeenCalledWith({
      where: { submissionId: "sub-1" },
    });
    expect(mocks.submissionDelete).toHaveBeenCalledWith({
      where: { id: "sub-1" },
    });
    expect(mocks.prismaTransaction).toHaveBeenCalledTimes(1);
    const txOps = mocks.prismaTransaction.mock.calls[0]?.[0];
    expect(Array.isArray(txOps)).toBe(true);
    expect(txOps).toHaveLength(2);
    expect(txOps[0]).toEqual({ kind: "deleteMany.run" });
    expect(txOps[1]).toEqual({ kind: "delete.submission" });

    // Telemetry: submission_deleted with the right counts.
    expect(mocks.track).toHaveBeenCalledWith(
      "submission_deleted",
      expect.objectContaining({
        submissionId: "sub-1",
        userId: "u-owner",
        runsDeleted: 3,
        runLogsDeleted: 2,
        hadBundle: true,
      }),
    );
  });

  it("skips the bundle purge when bundleObjectKey is empty (already-purged sentinel)", async () => {
    seedSubmission({ bundleObjectKey: "", runs: [] });

    const { req, ctx } = makeReq("sub-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(200);

    // No S3 calls at all — bundle empty + no runs.
    expect(mocks.deleteObject).not.toHaveBeenCalled();

    // hadBundle telemetry reflects the empty sentinel.
    expect(mocks.track).toHaveBeenCalledWith(
      "submission_deleted",
      expect.objectContaining({ hadBundle: false, runLogsDeleted: 0 }),
    );
  });

  it("returns 502 and skips DB writes when the bundle S3 delete fails", async () => {
    seedSubmission({ runs: [] });
    mocks.deleteObject.mockRejectedValueOnce(
      new Error("ECONNREFUSED 127.0.0.1:9000"),
    );

    const { req, ctx } = makeReq("sub-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("storage_unavailable");
    expect(body.stage).toBe("bundle");

    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("returns 503 when the submission lookup fails (DB unreachable)", async () => {
    mocks.submissionFindUnique.mockRejectedValue(new Error("PG down"));
    const { req, ctx } = makeReq("sub-1");
    const res = await DELETE(req, ctx);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("database_unavailable");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.prismaTransaction).not.toHaveBeenCalled();
  });

  it("is idempotent: re-deleting a missing submission returns 404, not 500", async () => {
    // First call: row exists, succeeds.
    seedSubmission({ runs: [] });
    const first = await DELETE(...Object.values(makeReq("sub-1")) as [
      Request,
      { params: Promise<{ id: string }> },
    ]);
    expect(first.status).toBe(200);

    // Second call: row is gone now.
    mocks.submissionFindUnique.mockResolvedValueOnce(null);
    const second = await DELETE(...Object.values(makeReq("sub-1")) as [
      Request,
      { params: Promise<{ id: string }> },
    ]);
    expect(second.status).toBe(404);
  });
});
