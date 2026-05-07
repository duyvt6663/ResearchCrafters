import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/mentor/messages/route.ts`.
 *
 * Pins:
 *  - Bearer / cookie auth gate (401 when unauthenticated).
 *  - Body validation through `mentorMessageRequestSchema` (400 with issues).
 *  - 404 when enrollment / stage missing.
 *  - Policy gate maps `mode` → `request_mentor_hint` vs
 *    `request_mentor_feedback`, fires the matching telemetry name on
 *    success, suppresses telemetry on denial.
 *  - `mentor_policy` denial returns the authored refusal copy verbatim
 *    (no model-generated refusal text).
 *  - `policy_misconfig` outcome from the runtime surfaces as 500 with a
 *    structured `stage_policy_misconfigured` error.
 *  - Happy-path returns `mentorMessageResponseSchema` shape.
 */

const mocks = vi.hoisted(() => ({
  getEnrollment: vi.fn(),
  getStage: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  track: vi.fn(),
  runMentorRequest: vi.fn(),
  stageFindUnique: vi.fn(),
  withQueryTimeout: vi.fn(),
  mentorRefusal: vi.fn(),
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
  denialHttpStatus: (r: string) => (r === "not_authenticated" ? 401 : 403),
}));

vi.mock("@/lib/telemetry", () => ({
  track: mocks.track,
}));

vi.mock("@/lib/mentor-runtime", () => ({
  runMentorRequest: mocks.runMentorRequest,
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: { stage: { findUnique: mocks.stageFindUnique } },
  withQueryTimeout: mocks.withQueryTimeout,
}));

vi.mock("@researchcrafters/ui/copy", () => ({
  mentorRefusal: mocks.mentorRefusal,
}));

import { POST } from "../../app/api/mentor/messages/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  // Identity wrapper so Prisma promises pass through.
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.mentorRefusal.mockReturnValue({
    title: "Mentor declined",
    body: "Authored refusal text.",
    hint: "Re-read the rubric.",
  });
});

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("http://localhost/api/mentor/messages", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  enrollmentId: "enr-1",
  stageRef: "S001",
  mode: "hint" as const,
  message: "I'm stuck.",
};

describe("POST /api/mentor/messages", () => {
  it("returns 400 with zod issues on a malformed body", async () => {
    const res = await POST(makeRequest({ enrollmentId: 42 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("bad_request");
    expect(Array.isArray(body.reason)).toBe(true);
    expect(mocks.getSessionFromRequest).not.toHaveBeenCalled();
  });

  it("returns 401 when the session has no userId", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(mocks.getEnrollment).not.toHaveBeenCalled();
  });

  it("returns 404 when the enrollment or stage is missing", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-1" });
    mocks.getEnrollment.mockResolvedValue(null);
    mocks.getStage.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
    expect(mocks.canAccess).not.toHaveBeenCalled();
  });

  it("maps mode=hint to request_mentor_hint policy + telemetry name", async () => {
    seedHappyPath();
    mocks.runMentorRequest.mockResolvedValue({
      kind: "ok",
      messageId: "mm-1",
      assistantText: "Try the gradient term.",
    });

    const res = await POST(makeRequest({ ...VALID_BODY, mode: "hint" }));
    expect(res.status).toBe(200);
    expect(mocks.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "request_mentor_hint" }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      "mentor_hint_requested",
      expect.objectContaining({ enrollmentId: "enr-1", stageRef: "S001" }),
    );
  });

  it("maps mode=clarify to request_mentor_feedback policy + telemetry name", async () => {
    seedHappyPath();
    mocks.runMentorRequest.mockResolvedValue({
      kind: "ok",
      messageId: "mm-1",
      assistantText: "Here's a steer.",
    });

    const res = await POST(
      makeRequest({ ...VALID_BODY, mode: "clarify" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.canAccess).toHaveBeenCalledWith(
      expect.objectContaining({ action: "request_mentor_feedback" }),
    );
    expect(mocks.track).toHaveBeenCalledWith(
      "mentor_feedback_requested",
      expect.any(Object),
    );
  });

  it("attaches authored refusal copy on a mentor_policy denial", async () => {
    seedHappyPath();
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "mentor_policy",
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
    expect(body.reason).toBe("mentor_policy");
    expect(body.refusal).toEqual({
      title: "Mentor declined",
      body: "Authored refusal text.",
      hint: "Re-read the rubric.",
    });
    expect(mocks.mentorRefusal).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "policy_block" }),
    );
    expect(mocks.runMentorRequest).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it("denies non-mentor_policy reasons WITHOUT the refusal copy attached", async () => {
    seedHappyPath();
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.refusal).toBeUndefined();
    expect(mocks.mentorRefusal).not.toHaveBeenCalled();
  });

  it("returns 500 stage_policy_misconfigured when the runtime refuses an `always` solution scope", async () => {
    seedHappyPath();
    mocks.runMentorRequest.mockResolvedValue({
      kind: "policy_misconfig",
      reason: "canonical_solution_visibility_always_forbidden",
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("stage_policy_misconfigured");
    expect(body.reason).toContain("canonical_solution");
  });

  it("returns the typed assistant message on the happy path", async () => {
    seedHappyPath();
    mocks.runMentorRequest.mockResolvedValue({
      kind: "ok",
      messageId: "mm-42",
      assistantText: "Your draft is on the right track.",
    });

    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toMatchObject({
      id: "mm-42",
      enrollmentId: "enr-1",
      stageRef: "S001",
      mode: "hint",
      role: "mentor",
      content: "Your draft is on the right track.",
    });
    expect(typeof body.message.createdAt).toBe("string");
  });

  it("returns 500 when stage_policy is missing from the mirrored row", async () => {
    seedHappyPath({ stagePolicy: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { error: string }).error).toBe(
      "stage_policy_missing",
    );
  });
});

function seedHappyPath(opts: { stagePolicy?: unknown } = {}): void {
  mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
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
  mocks.canAccess.mockResolvedValue({ allowed: true });
  mocks.stageFindUnique.mockResolvedValue({
    stagePolicy:
      opts.stagePolicy === undefined
        ? { mentor_visibility: { canonical_solution: "after_pass" } }
        : opts.stagePolicy,
  });
}
