import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/share-cards/route.ts`.
 *
 * Pins the body-validation hardening (the route used to 500 on empty body)
 * + the auth + permission gate that protects against unauthorised
 * share-card creation.
 */

const mocks = vi.hoisted(() => ({
  getEnrollment: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/data/enrollment", () => ({
  getEnrollment: mocks.getEnrollment,
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

import { POST } from "../../app/api/share-cards/route";

beforeEach(() => {
  mocks.getEnrollment.mockReset();
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
  return new Request("http://localhost/api/share-cards", init);
}

describe("POST /api/share-cards", () => {
  it("returns 400 invalid_json on a malformed body (regression: used to 500)", async () => {
    const req = new Request("http://localhost/api/share-cards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(body.reason).toBe("invalid_json");
    // Short-circuited before auth/db.
    expect(mocks.getEnrollment).not.toHaveBeenCalled();
  });

  it("returns 400 missing_required_fields on empty {}", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe(
      "missing_required_fields",
    );
  });

  it("returns 400 when insight is missing", async () => {
    const res = await POST(makeRequest({ enrollmentId: "enr-1" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { reason: string }).reason).toBe(
      "missing_required_fields",
    );
  });

  it("returns 404 when the enrollment doesn't exist", async () => {
    mocks.getEnrollment.mockResolvedValue(null);
    const res = await POST(
      makeRequest({ enrollmentId: "missing", insight: "hi" }),
    );
    expect(res.status).toBe(404);
    expect(mocks.canAccess).not.toHaveBeenCalled();
  });

  it("returns 403 when permissions.canAccess denies (no telemetry, no card)", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-1",
      packageVersionId: "pv-1",
      activeStageRef: "S001",
      packageSlug: "resnet",
      completedStageRefs: [],
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-free" });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });
    const res = await POST(
      makeRequest({ enrollmentId: "enr-1", insight: "x" }),
    );
    expect(res.status).toBe(403);
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("creates a card + emits telemetry + returns the typed payload on the happy path", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-1",
      packageVersionId: "pv-1",
      activeStageRef: "S008",
      packageSlug: "resnet",
      completedStageRefs: ["S001", "S002"],
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const res = await POST(
      makeRequest({
        enrollmentId: "enr-1",
        insight: "Residual reformulation moves identity into init.",
        hardestDecision: "S002",
        selectedBranchType: "canonical",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shareCard).toBeDefined();
    expect(body.shareCard.id).toMatch(/^sc-/);
    expect(body.shareCard.enrollmentId).toBe("enr-1");
    expect(body.shareCard.payload.learnerInsight).toContain(
      "Residual reformulation",
    );
    expect(body.shareCard.payload.cohortPercentage).toBeNull();
    expect(mocks.track).toHaveBeenCalledWith(
      "share_card_created",
      expect.objectContaining({
        enrollmentId: "enr-1",
        packageVersionId: "pv-1",
      }),
    );
  });
});
