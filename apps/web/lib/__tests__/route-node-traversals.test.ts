import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/node-traversals/route.ts`.
 *
 * Pins the body-validation guards + the per-traversal `submit_attempt`
 * policy gate that prevents free users from silently traversing paid
 * decision nodes.
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

import { POST } from "../../app/api/node-traversals/route";

beforeEach(() => {
  mocks.getEnrollment.mockReset();
  mocks.getStage.mockReset();
  mocks.getSessionFromRequest.mockReset();
  mocks.canAccess.mockReset();
  mocks.track.mockReset();
});

function makeRequest(body: unknown): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  return new Request("http://localhost/api/node-traversals", init);
}

describe("POST /api/node-traversals", () => {
  it("returns 400 invalid_json on malformed body (regression: 500 vector)", async () => {
    const req = new Request("http://localhost/api/node-traversals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{[",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.reason).toBe("invalid_json");
    expect(mocks.getEnrollment).not.toHaveBeenCalled();
  });

  it("returns 400 when ANY of the required fields is missing", async () => {
    // Required: enrollmentId, stageRef, nodeRef, branchId.
    for (const omit of ["enrollmentId", "stageRef", "nodeRef", "branchId"] as const) {
      const full = {
        enrollmentId: "enr-1",
        stageRef: "S002",
        nodeRef: "N002",
        branchId: "branch-canonical",
      };
      const partial = { ...full };
      delete (partial as Record<string, unknown>)[omit];
      const res = await POST(makeRequest(partial));
      expect(res.status, `missing ${omit}`).toBe(400);
      expect(
        ((await res.json()) as { reason: string }).reason,
        `missing ${omit}`,
      ).toBe("missing_required_fields");
    }
  });

  it("returns 404 when enrollment OR stage is missing", async () => {
    mocks.getEnrollment.mockResolvedValue(null);
    mocks.getStage.mockResolvedValue(null);
    const res = await POST(
      makeRequest({
        enrollmentId: "missing",
        stageRef: "S002",
        nodeRef: "N002",
        branchId: "x",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("emits branch_selected on the happy path under the submit_attempt policy", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-1",
      packageVersionId: "pv-1",
      activeStageRef: "S002",
    });
    mocks.getStage.mockResolvedValue({
      ref: "S002",
      isFreePreview: false,
      isLocked: false,
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const res = await POST(
      makeRequest({
        enrollmentId: "enr-1",
        stageRef: "S002",
        nodeRef: "N002",
        branchId: "branch-canonical",
        confidence: 0.7,
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "submit_attempt" }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      "branch_selected",
      expect.objectContaining({
        enrollmentId: "enr-1",
        stageRef: "S002",
        nodeRef: "N002",
        branchId: "branch-canonical",
        confidence: 0.7,
      }),
    );
  });

  it("forbids paid-stage traversal without entitlement (no telemetry)", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-1",
      packageVersionId: "pv-1",
      activeStageRef: "S002",
    });
    mocks.getStage.mockResolvedValue({
      ref: "S002",
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
        stageRef: "S002",
        nodeRef: "N002",
        branchId: "branch-canonical",
      }),
    );
    expect(res.status).toBe(403);
    expect(mocks.track).not.toHaveBeenCalled();
  });
});
