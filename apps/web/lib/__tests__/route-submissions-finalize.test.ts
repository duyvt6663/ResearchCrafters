import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/submissions/[id]/finalize/route.ts`.
 *
 * Pins:
 *  - Schema validation (`submissionFinalizeRequestSchema`): malformed body or
 *    missing fields → 400 `bad_request`.
 *  - Integrity gate: the route delegates to `checkUploadIntegrity()` from
 *    `@/lib/storage`. We mock both `headObject` and `checkUploadIntegrity` so
 *    each branch (sha256_mismatch, byte_size_mismatch, object_not_found,
 *    match) flows through the route's response shape.
 *  - Run row creation: on a real submission, `prisma.run.create` is called
 *    with `status: "queued"` + the resolved runnerMode.
 *  - Telemetry: `runner_job_started` fires.
 *  - Redis-down degrade: when `getProducerQueue` throws, the route returns
 *    200 `{ runId, queueDeferred: true }` instead of 5xx.
 *
 * NOTE: The route only emits a 404-like behaviour by routing all "missing
 * submission row" cases through a synthesised id branch — the CLI still
 * gets `{ runId }`. The integrity check + Run.create only fire when a
 * submission row exists, so the "row doesn't exist" coverage pins the
 * synthesised-id branch instead of a 404 response.
 */

const mocks = vi.hoisted(() => ({
  submissionFindUnique: vi.fn(),
  runCreate: vi.fn(),
  submissionUpdate: vi.fn(),
  stageFindFirst: vi.fn(),
  withQueryTimeout: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  track: vi.fn(),
  headObject: vi.fn(),
  checkUploadIntegrity: vi.fn(),
  getStorageEnv: vi.fn(),
  getProducerQueue: vi.fn(),
  queueAdd: vi.fn(),
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    submission: {
      findUnique: mocks.submissionFindUnique,
      update: mocks.submissionUpdate,
    },
    run: { create: mocks.runCreate },
    stage: { findFirst: mocks.stageFindFirst },
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/permissions", () => ({
  permissions: { canAccess: mocks.canAccess },
  denialHttpStatus: (r: string) => (r === "not_authenticated" ? 401 : 403),
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

vi.mock("@/lib/storage", () => ({
  headObject: mocks.headObject,
  checkUploadIntegrity: mocks.checkUploadIntegrity,
  getStorageEnv: mocks.getStorageEnv,
}));

vi.mock("@researchcrafters/worker/admin", () => ({
  getProducerQueue: mocks.getProducerQueue,
}));

vi.mock("@researchcrafters/worker", () => ({
  SUBMISSION_RUN_QUEUE: "submission_run",
}));

import { POST } from "../../app/api/submissions/[id]/finalize/route";

const VALID_BODY = {
  uploadedSha256: "f".repeat(64),
  uploadedBytes: 2048,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  // Identity wrapper around Prisma promises.
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
  mocks.canAccess.mockResolvedValue({ allowed: true });
  mocks.getStorageEnv.mockReturnValue({
    buckets: {
      submissions: "researchcrafters-submissions",
      runs: "researchcrafters-runs",
      packages: "researchcrafters-packages",
      shareCards: "researchcrafters-share-cards",
    },
  });
  mocks.headObject.mockResolvedValue({
    exists: true,
    sha256: "f".repeat(64),
    size: 2048,
  });
  // Default: integrity OK.
  mocks.checkUploadIntegrity.mockReturnValue(null);
  mocks.runCreate.mockResolvedValue({ id: "run-real" });
  // Default: Redis up — queue.add resolves.
  mocks.queueAdd.mockResolvedValue({ id: "run-real" });
  mocks.getProducerQueue.mockResolvedValue({
    name: "submission_run",
    add: mocks.queueAdd,
    close: vi.fn(),
  });
});

function makeReq(
  id: string,
  body: unknown,
): { req: Request; ctx: { params: Promise<{ id: string }> } } {
  const req = new Request(
    `http://localhost/api/submissions/${id}/finalize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
  return { req, ctx: { params: Promise.resolve({ id }) } };
}

function seedSubmission(): void {
  mocks.submissionFindUnique.mockResolvedValue({
    id: "sub-1",
    bundleObjectKey: "submissions/sub-1/bundle.tar",
    bundleSha: "f".repeat(64),
    byteSize: 2048,
    stageAttempt: {
      id: "att-1",
      stageRef: "S001",
      enrollment: { packageVersionId: "pv-1" },
    },
  });
  mocks.stageFindFirst.mockResolvedValue({ runnerMode: "test" });
}

describe("POST /api/submissions/[id]/finalize", () => {
  it("returns 400 bad_request on a malformed body (regression: must not 500)", async () => {
    const { req, ctx } = makeReq("sub-1", { uploadedBytes: 10 });
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.reason)).toBe(true);
    expect(mocks.runCreate).not.toHaveBeenCalled();
  });

  it("returns 400 sha256_mismatch when checkUploadIntegrity reports it", async () => {
    seedSubmission();
    mocks.checkUploadIntegrity.mockReturnValue({
      error: "sha256_mismatch",
      expected: "a".repeat(64),
      status: 400,
    });

    const { req, ctx } = makeReq("sub-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("sha256_mismatch");
    expect(body.expected).toBe("a".repeat(64));
    // Run.create must not fire on integrity failure.
    expect(mocks.runCreate).not.toHaveBeenCalled();
    expect(mocks.queueAdd).not.toHaveBeenCalled();
  });

  it("returns 400 byte_size_mismatch when checkUploadIntegrity reports it", async () => {
    seedSubmission();
    mocks.checkUploadIntegrity.mockReturnValue({
      error: "byte_size_mismatch",
      expected: 9999,
      status: 400,
    });

    const { req, ctx } = makeReq("sub-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("byte_size_mismatch");
    expect(body.expected).toBe(9999);
    expect(mocks.runCreate).not.toHaveBeenCalled();
  });

  it("returns 400 object_not_found when MinIO has nothing at the recorded key", async () => {
    seedSubmission();
    mocks.headObject.mockResolvedValue({ exists: false });
    mocks.checkUploadIntegrity.mockReturnValue({
      error: "object_not_found",
      status: 400,
    });

    const { req, ctx } = makeReq("sub-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "object_not_found",
    );
  });

  it("happy path: creates Run row in queued state, enqueues BullMQ job, fires telemetry", async () => {
    seedSubmission();
    const { req, ctx } = makeReq("sub-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("run-real");
    // queueDeferred is omitted when the broker is up.
    expect(body.queueDeferred).toBeUndefined();

    // Run.create called with queued + resolved runnerMode.
    expect(mocks.runCreate).toHaveBeenCalledTimes(1);
    const createArg = mocks.runCreate.mock.calls[0]?.[0];
    expect(createArg.data.submissionId).toBe("sub-1");
    expect(createArg.data.status).toBe("queued");
    expect(createArg.data.runnerMode).toBe("test");

    // BullMQ enqueue: jobId pinned to runId for dedupe.
    expect(mocks.getProducerQueue).toHaveBeenCalledWith("submission_run");
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1);
    const addCall = mocks.queueAdd.mock.calls[0];
    expect(addCall?.[0]).toBe("submission_run");
    const payload = addCall?.[1] as Record<string, unknown>;
    expect(payload["runId"]).toBe("run-real");
    expect(payload["submissionId"]).toBe("sub-1");
    expect(payload["packageVersionId"]).toBe("pv-1");
    expect(payload["stageRef"]).toBe("S001");
    expect(payload["runnerMode"]).toBe("test");
    expect(addCall?.[2]).toEqual({ jobId: "run-real" });

    // Telemetry fired.
    expect(mocks.track).toHaveBeenCalledWith(
      "runner_job_started",
      expect.objectContaining({
        runId: "run-real",
        submissionId: "sub-1",
        stageRef: "S001",
        queueDeferred: false,
      }),
    );
  });

  it("Redis-down degrade: BullMQ enqueue throw → 200 with queueDeferred: true (no 5xx)", async () => {
    seedSubmission();
    mocks.getProducerQueue.mockRejectedValue(
      new Error("ECONNREFUSED 127.0.0.1:6379"),
    );

    const { req, ctx } = makeReq("sub-1", VALID_BODY);
    const res = await POST(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.runId).toBe("run-real");
    expect(body.queueDeferred).toBe(true);
    // Run row was still created so a worker can pick it up later.
    expect(mocks.runCreate).toHaveBeenCalledTimes(1);
    // Telemetry recorded the deferral.
    expect(mocks.track).toHaveBeenCalledWith(
      "runner_job_started",
      expect.objectContaining({ queueDeferred: true }),
    );
  });

  it("when submission row doesn't exist, returns synthesised runId without DB-side Run.create", async () => {
    mocks.submissionFindUnique.mockResolvedValue(null);

    const { req, ctx } = makeReq("sub-missing", VALID_BODY);
    const res = await POST(req, ctx);
    // The route doesn't 404 — it routes through a synthesised id so the CLI
    // can finish the contract round-trip. Pin that.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.runId).toBe("string");
    expect(body.runId.length).toBeGreaterThan(0);
    // No Run.create when there's no submission row.
    expect(mocks.runCreate).not.toHaveBeenCalled();
    // No BullMQ enqueue either (submission-gated).
    expect(mocks.queueAdd).not.toHaveBeenCalled();
    // checkUploadIntegrity is not called when the submission row is missing.
    expect(mocks.checkUploadIntegrity).not.toHaveBeenCalled();
  });
});
