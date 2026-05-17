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
  getPackageBySlug: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  track: vi.fn(),
  createShareCard: vi.fn(),
  generatePublicSlug: vi.fn(),
}));

vi.mock("@/lib/data/enrollment", () => ({
  getEnrollment: mocks.getEnrollment,
}));

vi.mock("@/lib/data/packages", () => ({
  getPackageBySlug: mocks.getPackageBySlug,
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

vi.mock("@/lib/data/share-cards", () => ({
  createShareCard: mocks.createShareCard,
}));

vi.mock("@researchcrafters/worker", () => ({
  generatePublicSlug: mocks.generatePublicSlug,
}));

import { POST } from "../../app/api/share-cards/route";

beforeEach(() => {
  mocks.getEnrollment.mockReset();
  mocks.getPackageBySlug.mockReset();
  mocks.getSessionFromRequest.mockReset();
  mocks.canAccess.mockReset();
  mocks.track.mockReset();
  mocks.createShareCard.mockReset();
  mocks.generatePublicSlug.mockReset();
  mocks.createShareCard.mockResolvedValue({ id: "sc-test-id" });
  mocks.generatePublicSlug.mockReturnValue("pub-test-slug");
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
    mocks.getPackageBySlug.mockResolvedValue({
      slug: "resnet",
      stages: [
        { ref: "S001" },
        { ref: "S002" },
        { ref: "S003" },
        { ref: "S004" },
      ],
      sampleDecision: { prompt: "Pick a residual init strategy" },
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
    expect(body.shareCard.payload).toMatchObject({
      packageSlug: "resnet",
      packageVersionId: "pv-1",
      completionStatus: "in_progress",
      scoreSummary: { passed: 2, total: 4 },
      hardestDecision: "S002",
      selectedBranchType: "canonical",
      cohortPercentage: null,
    });
    expect(body.shareCard.payload.learnerInsight).toContain(
      "Residual reformulation",
    );
    expect(mocks.track).toHaveBeenCalledWith(
      "share_card_created",
      expect.objectContaining({
        enrollmentId: "enr-1",
        packageVersionId: "pv-1",
      }),
    );
  });

  it("derives completion='complete' when every stage is in completedStageRefs", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-2",
      packageVersionId: "pv-1",
      activeStageRef: "S002",
      packageSlug: "resnet",
      completedStageRefs: ["S001", "S002"],
    });
    mocks.getPackageBySlug.mockResolvedValue({
      slug: "resnet",
      stages: [{ ref: "S001" }, { ref: "S002" }],
      sampleDecision: { prompt: "Pick a strategy" },
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const res = await POST(
      makeRequest({ enrollmentId: "enr-2", insight: "done" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shareCard.payload.completionStatus).toBe("complete");
    expect(body.shareCard.payload.scoreSummary).toEqual({
      passed: 2,
      total: 2,
    });
    // Falls back to sampleDecision when caller omits hardestDecision.
    expect(body.shareCard.payload.hardestDecision).toBe("Pick a strategy");
  });

  it("maps authored 'failed' branch to public 'alternative' for the share surface", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-3",
      packageVersionId: "pv-1",
      activeStageRef: "S004",
      packageSlug: "resnet",
      completedStageRefs: ["S001"],
    });
    mocks.getPackageBySlug.mockResolvedValue({
      slug: "resnet",
      stages: [{ ref: "S001" }, { ref: "S002" }],
      sampleDecision: null,
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const res = await POST(
      makeRequest({
        enrollmentId: "enr-3",
        insight: "Took a dead end and learned.",
        selectedBranchType: "failed",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shareCard.payload.selectedBranchType).toBe("alternative");
  });

  it("persists an immutable share-card snapshot row + generates a public slug", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-9",
      packageVersionId: "pv-2",
      activeStageRef: "S003",
      packageSlug: "resnet",
      completedStageRefs: ["S001"],
    });
    mocks.getPackageBySlug.mockResolvedValue({
      slug: "resnet",
      stages: [{ ref: "S001" }, { ref: "S002" }, { ref: "S003" }],
      sampleDecision: { prompt: "Pick a strategy" },
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.generatePublicSlug.mockReturnValue("pub-abc123");
    mocks.createShareCard.mockResolvedValue({ id: "sc-persisted" });

    const res = await POST(
      makeRequest({
        enrollmentId: "enr-9",
        insight: "Snapshot must persist exactly what the learner saw.",
        hardestDecision: "S002",
        selectedBranchType: "suboptimal",
      }),
    );
    expect(res.status).toBe(200);

    expect(mocks.generatePublicSlug).toHaveBeenCalledTimes(1);
    expect(mocks.createShareCard).toHaveBeenCalledTimes(1);
    const persistArgs = mocks.createShareCard.mock.calls[0]?.[0];
    expect(persistArgs).toMatchObject({
      userId: "u-paid",
      enrollmentId: "enr-9",
      packageVersionId: "pv-2",
      publicSlug: "pub-abc123",
    });
    // The payload row carries every field the share surface depends on so
    // future reads stay stable even if upstream packages / enrollments
    // mutate (backlog/06 §Share Cards).
    expect(persistArgs.payload).toMatchObject({
      packageSlug: "resnet",
      packageVersionId: "pv-2",
      completionStatus: "in_progress",
      scoreSummary: { passed: 1, total: 3 },
      hardestDecision: "S002",
      selectedBranchType: "suboptimal",
      cohortPercentage: null,
    });
    expect(persistArgs.payload.learnerInsight).toContain("Snapshot must");

    const body = await res.json();
    expect(body.shareCard.id).toBe("sc-persisted");
    expect(body.shareCard.publicSlug).toBe("pub-abc123");
    expect(body.shareCard.publicUrl).toContain("pub-abc123");
  });

  it("returns 401 when permissions allow but the session has no userId (defensive)", async () => {
    mocks.getEnrollment.mockResolvedValue({
      id: "enr-anon",
      packageVersionId: "pv-1",
      activeStageRef: "S001",
      packageSlug: "resnet",
      completedStageRefs: [],
    });
    mocks.getPackageBySlug.mockResolvedValue({
      slug: "resnet",
      stages: [{ ref: "S001" }],
      sampleDecision: null,
    });
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const res = await POST(
      makeRequest({ enrollmentId: "enr-anon", insight: "anon" }),
    );
    expect(res.status).toBe(401);
    expect(mocks.createShareCard).not.toHaveBeenCalled();
    expect(mocks.generatePublicSlug).not.toHaveBeenCalled();
  });

  it("rejects unknown branch types with 400 invalid_branch_type", async () => {
    const res = await POST(
      makeRequest({
        enrollmentId: "enr-1",
        insight: "x",
        selectedBranchType: "garbage" as never,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("invalid_branch_type");
    expect(mocks.getEnrollment).not.toHaveBeenCalled();
  });
});
