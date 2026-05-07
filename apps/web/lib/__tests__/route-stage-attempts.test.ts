import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/stage-attempts/route.ts`.
 *
 * The route used to crash with 500 on empty/malformed bodies because it
 * called `(await req.json()) as Body` without try/catch and without
 * required-field guards. The fix added a structured 400 path. These
 * tests pin the four 4xx/2xx outcomes so a careless edit can't reintroduce
 * the 500 vector.
 */

const mocks = vi.hoisted(() => ({
  getEnrollment: vi.fn(),
  getStage: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/data/enrollment", () => ({
  getEnrollment: mocks.getEnrollment,
  getStage: mocks.getStage,
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/permissions", () => ({
  permissions: { canAccess: mocks.canAccess },
  denialHttpStatus: () => 403,
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

import { POST } from "../../app/api/stage-attempts/route";

beforeEach(() => {
  mocks.getEnrollment.mockReset();
  mocks.getStage.mockReset();
  mocks.getSessionFromRequest.mockReset();
  mocks.canAccess.mockReset();
  mocks.track.mockReset();
});

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/api/stage-attempts", init);
}

describe("POST /api/stage-attempts", () => {
  it("returns 400 invalid_json on a malformed body (regression: used to 500)", async () => {
    const req = new Request("http://localhost/api/stage-attempts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.reason).toBe("invalid_json");
    // The route short-circuited before reaching auth/permissions/db.
    expect(mocks.getSessionFromRequest).not.toHaveBeenCalled();
    expect(mocks.getEnrollment).not.toHaveBeenCalled();
  });

  it("returns 400 missing_required_fields on empty {} body", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.reason).toBe("missing_required_fields");
  });

  it("returns 400 missing_required_fields when stageRef is absent", async () => {
    const res = await POST(makeRequest({ enrollmentId: "enr-1" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe(
      "missing_required_fields",
    );
  });

  it("returns 404 when the enrollment doesn't exist", async () => {
    mocks.getEnrollment.mockResolvedValue(null);
    mocks.getStage.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ enrollmentId: "missing", stageRef: "S001", answer: {} }),
    );
    expect(res.status).toBe(404);
  });

  it("creates an attempt and emits telemetry on the happy path", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-1",
      packageVersionId: "pv-1",
      activeStageRef: "S001",
    });
    mocks.getStage.mockResolvedValue({
      ref: "S001",
      isFreePreview: true,
      isLocked: false,
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const res = await POST(
      makeRequest({
        enrollmentId: "enr-1",
        stageRef: "S001",
        answer: { text: "draft" },
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.track).toHaveBeenCalledWith(
      "stage_attempt_submitted",
      expect.objectContaining({ stageRef: "S001" }),
    );
  });

  it("returns 403 when permissions.canAccess denies", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-1",
      packageVersionId: "pv-1",
      activeStageRef: "S001",
    });
    mocks.getStage.mockResolvedValue({
      ref: "S001",
      isFreePreview: false,
      isLocked: false,
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-free" });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });

    const res = await POST(
      makeRequest({
        enrollmentId: "enr-1",
        stageRef: "S001",
        answer: { text: "x" },
      }),
    );
    expect(res.status).toBe(403);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
