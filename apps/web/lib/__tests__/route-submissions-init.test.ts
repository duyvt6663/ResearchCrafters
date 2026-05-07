import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/submissions/route.ts` (submission init).
 *
 * Pins the four load-bearing invariants:
 *  1. Schema validation through `submissionInitRequestSchema` (400 on bad
 *     body, no 500 vector).
 *  2. Auth gate: `session.userId === null` → 401 with `not_authenticated`.
 *  3. Two-phase Submission write — placeholder bundle key first, then a
 *     follow-up update once Prisma assigns the real id. Pinned because the
 *     follow-up update is the only place the canonical
 *     `submissions/<id>/bundle.tar` key lands on the row.
 *  4. Storage signing — `signUploadUrl` is called with the right bucket and
 *     the canonical key shape; the route returns the signed URL + headers
 *     verbatim plus the `x-rc-submission-id` echo header.
 *  5. Telemetry: `stage_attempt_submitted` fires with the persisted submission
 *     id.
 */

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  track: vi.fn(),
  signUploadUrl: vi.fn(),
  getStorageEnv: vi.fn(),
  enrollmentFindFirst: vi.fn(),
  stageAttemptCreate: vi.fn(),
  submissionCreate: vi.fn(),
  submissionUpdate: vi.fn(),
  withQueryTimeout: vi.fn(),
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
  signUploadUrl: mocks.signUploadUrl,
  getStorageEnv: mocks.getStorageEnv,
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: {
    enrollment: { findFirst: mocks.enrollmentFindFirst },
    stageAttempt: { create: mocks.stageAttemptCreate },
    submission: {
      create: mocks.submissionCreate,
      update: mocks.submissionUpdate,
    },
  },
  withQueryTimeout: mocks.withQueryTimeout,
}));

import { POST } from "../../app/api/submissions/route";

const VALID_BODY = {
  packageVersionId: "pv-1",
  stageRef: "S001",
  fileCount: 5,
  byteSize: 1024,
  // 64-char lowercase hex sha256.
  sha256: "a".repeat(64),
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  // Identity wrapper around Prisma promises.
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.getStorageEnv.mockReturnValue({
    buckets: {
      submissions: "researchcrafters-submissions",
      runs: "researchcrafters-runs",
      packages: "researchcrafters-packages",
      shareCards: "researchcrafters-share-cards",
    },
  });
  mocks.signUploadUrl.mockResolvedValue({
    uploadUrl: "https://signed.example/submissions/upload?sig=abc",
    headers: { "Content-Type": "application/octet-stream" },
  });
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/submissions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/submissions (init)", () => {
  it("returns 400 bad_request on a malformed body (regression: must not 500)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    const res = await POST(makeRequest({ stageRef: "S001" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.reason)).toBe(true);
    // Short-circuited before storage work.
    expect(mocks.signUploadUrl).not.toHaveBeenCalled();
    expect(mocks.submissionCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when sha256 is the wrong length / not hex", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    const res = await POST(
      makeRequest({ ...VALID_BODY, sha256: "deadbeef" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 401 forbidden:not_authenticated when session has no userId", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.reason).toBe("not_authenticated");
    expect(mocks.canAccess).not.toHaveBeenCalled();
  });

  it("returns 403 when permissions.canAccess denies", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-free" });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(mocks.submissionCreate).not.toHaveBeenCalled();
  });

  it("happy path: creates Submission + StageAttempt, two-phase rewrites bundle key, signs URL, fires telemetry", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.enrollmentFindFirst.mockResolvedValue({ id: "enr-1" });
    mocks.stageAttemptCreate.mockResolvedValue({ id: "att-9" });
    mocks.submissionCreate.mockResolvedValue({ id: "sub-real" });
    mocks.submissionUpdate.mockResolvedValue({ id: "sub-real" });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Contract shape.
    expect(body.submissionId).toBe("sub-real");
    expect(typeof body.uploadUrl).toBe("string");
    expect(body.uploadUrl.length).toBeGreaterThan(0);
    expect(body.uploadHeaders["x-rc-submission-id"]).toBe("sub-real");

    // StageAttempt was created against the resolved enrollment.
    expect(mocks.stageAttemptCreate).toHaveBeenCalledTimes(1);
    const attemptArg = mocks.stageAttemptCreate.mock.calls[0]?.[0];
    expect(attemptArg.data.enrollmentId).toBe("enr-1");
    expect(attemptArg.data.stageRef).toBe("S001");

    // Submission row created with the recorded sha + sizes.
    expect(mocks.submissionCreate).toHaveBeenCalledTimes(1);
    const createArg = mocks.submissionCreate.mock.calls[0]?.[0];
    expect(createArg.data.stageAttemptId).toBe("att-9");
    expect(createArg.data.bundleSha).toBe(VALID_BODY.sha256.toLowerCase());
    expect(createArg.data.byteSize).toBe(1024);
    expect(createArg.data.fileCount).toBe(5);
    // The placeholder key uses a synthesised id (`sub-<timestamp>`); the
    // shape is the canonical `submissions/<id>/bundle.tar`.
    expect(createArg.data.bundleObjectKey).toMatch(
      /^submissions\/sub-.+\/bundle\.tar$/,
    );

    // Two-phase write: a follow-up update with the real submission id
    // assigned by Prisma. This is the load-bearing rewrite — without it the
    // bundle key references a synthesised id the runner can't resolve.
    expect(mocks.submissionUpdate).toHaveBeenCalledTimes(1);
    const updateArg = mocks.submissionUpdate.mock.calls[0]?.[0];
    expect(updateArg.where).toEqual({ id: "sub-real" });
    expect(updateArg.data.bundleObjectKey).toBe(
      "submissions/sub-real/bundle.tar",
    );

    // Storage signing receives the canonical bucket + key shape.
    expect(mocks.signUploadUrl).toHaveBeenCalledTimes(1);
    const signArg = mocks.signUploadUrl.mock.calls[0]?.[0];
    expect(signArg.bucket).toBe("researchcrafters-submissions");
    expect(signArg.key).toBe("submissions/sub-real/bundle.tar");
    expect(signArg.contentType).toBe("application/octet-stream");

    // Telemetry fired with the persisted submission id.
    expect(mocks.track).toHaveBeenCalledWith(
      "stage_attempt_submitted",
      expect.objectContaining({
        submissionId: "sub-real",
        stageRef: "S001",
      }),
    );
  });

  it("uses caller-supplied stageAttemptId when provided (skips StageAttempt create)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.submissionCreate.mockResolvedValue({ id: "sub-x" });
    mocks.submissionUpdate.mockResolvedValue({ id: "sub-x" });

    const res = await POST(
      makeRequest({ ...VALID_BODY, stageAttemptId: "att-given" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.enrollmentFindFirst).not.toHaveBeenCalled();
    expect(mocks.stageAttemptCreate).not.toHaveBeenCalled();
    const createArg = mocks.submissionCreate.mock.calls[0]?.[0];
    expect(createArg.data.stageAttemptId).toBe("att-given");
  });

  it("survives DB unreachable on submission.create (synthesizes id, still signs URL)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.enrollmentFindFirst.mockResolvedValue(null);
    mocks.submissionCreate.mockRejectedValue(new Error("connection lost"));

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Synthesised id pattern: `sub-<timestamp>`.
    expect(body.submissionId).toMatch(/^sub-/);
    // The route still signed an upload URL so the CLI's loop can finish
    // round-tripping the contract shape.
    expect(mocks.signUploadUrl).toHaveBeenCalled();
    // The follow-up update is skipped when the create fails.
    expect(mocks.submissionUpdate).not.toHaveBeenCalled();
  });
});
