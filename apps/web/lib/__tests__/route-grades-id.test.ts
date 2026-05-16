import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/grades/[id]/route.ts`.
 *
 * The rubric panel is still a STUB — it does NOT read `prisma.grade` for
 * the rubric / overall score. The auth surface is `permissions.canAccess`
 * with a synthetic stage descriptor (`packageVersionId: "unknown"`,
 * `ref: "grade"`).
 *
 * What the route DOES read from Prisma: the `Grade.history` JSON column,
 * so a reviewer override is surfaced back to the learner with the reviewer
 * note (backlog/04 § Human Override). When the lookup fails or the row is
 * missing the route degrades to an empty overrides array — the rubric
 * panel still renders.
 *
 * Pinned details:
 *   - There is no 404 branch (the route can't tell missing from present).
 *   - 401 is emitted as 403 by the route (it hard-codes status 403 on
 *     denial rather than calling `denialHttpStatus(reason)`).
 *   - DB unreachable: overrides=[], rubric stub still served.
 */

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
  gradeFindUnique: vi.fn(),
  withQueryTimeout: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/permissions", () => ({
  permissions: { canAccess: mocks.canAccess },
}));

vi.mock("@researchcrafters/db", () => ({
  prisma: { grade: { findUnique: mocks.gradeFindUnique } },
  withQueryTimeout: mocks.withQueryTimeout,
}));

import { GET } from "../../app/api/grades/[id]/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.withQueryTimeout.mockImplementation(async (p) => p);
  mocks.gradeFindUnique.mockResolvedValue(null);
});

function makeCtx(id: string): {
  req: Request;
  ctx: { params: Promise<{ id: string }> };
} {
  return {
    req: new Request(`http://localhost/api/grades/${id}`),
    ctx: { params: Promise.resolve({ id }) },
  };
}

describe("GET /api/grades/[id]", () => {
  it("returns 403 when permissions denies an unauthenticated caller (route hard-codes 403)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "not_authenticated",
    });

    const { req, ctx } = makeCtx("grade-1");
    const res = await GET(req, ctx);
    // The route returns 403 on every denial regardless of reason. A real
    // 401 path would require routing the reason through `denialHttpStatus`.
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("not_authenticated");
  });

  it("returns 403 with the access reason when canAccess denies (no entitlement)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-free" });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });

    const { req, ctx } = makeCtx("grade-2");
    const res = await GET(req, ctx);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("no_entitlement");
  });

  it("calls canAccess with the synthetic grade-stage descriptor and view_stage action", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const { req, ctx } = makeCtx("grade-3");
    await GET(req, ctx);

    expect(mocks.canAccess).toHaveBeenCalledTimes(1);
    const callArg = mocks.canAccess.mock.calls[0]?.[0];
    expect(callArg).toBeDefined();
    expect(callArg.action).toBe("view_stage");
    expect(callArg.packageVersionId).toBe("unknown");
    expect(callArg.stage).toEqual({
      ref: "grade",
      isFreePreview: false,
      isLocked: false,
    });
  });

  it("returns the contract-shaped grade payload on the happy path", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const { req, ctx } = makeCtx("grade-42");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grade).toBeDefined();
    expect(body.grade.id).toBe("grade-42");
    expect(typeof body.grade.status).toBe("string");
    expect(typeof body.grade.overall).toBe("number");
    expect(Array.isArray(body.grade.rubric)).toBe(true);
    // Every rubric line must carry id/label/score so the grade panel can
    // render without falling back to placeholder text.
    for (const line of body.grade.rubric) {
      expect(typeof line.id).toBe("string");
      expect(typeof line.label).toBe("string");
      expect(typeof line.score).toBe("number");
    }
    expect(typeof body.grade.nextAction).toBe("string");
    // Overrides surface is always present and is an array (empty when there
    // are no overrides, populated when there are).
    expect(Array.isArray(body.grade.overrides)).toBe(true);
  });

  it("threads the route id through to the response body (not hard-coded)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const ids = ["grade-aaa", "grade-bbb", "grade-ccc"];
    for (const id of ids) {
      const { req, ctx } = makeCtx(id);
      const res = await GET(req, ctx);
      const body = (await res.json()) as { grade: { id: string } };
      expect(body.grade.id).toBe(id);
    }
  });

  it("forwards the Request to getSessionFromRequest (Bearer-aware)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });

    const { req, ctx } = makeCtx("grade-bearer");
    await GET(req, ctx);
    expect(mocks.getSessionFromRequest).toHaveBeenCalledTimes(1);
    expect(mocks.getSessionFromRequest.mock.calls[0]?.[0]).toBe(req);
  });

  it("surfaces reviewer overrides + notes when the grade row carries history", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.gradeFindUnique.mockResolvedValue({
      history: [
        {
          reviewerId: "rev-1",
          note: "Rescored after appendix figure cited.",
          appliedAt: "2026-05-15T10:00:00Z",
          override: { status: "passed", rubricScore: 0.92 },
        },
      ],
    });

    const { req, ctx } = makeCtx("grade-with-override");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grade.overrides).toHaveLength(1);
    const o = body.grade.overrides[0];
    expect(o.reviewerId).toBe("rev-1");
    expect(o.note).toBe("Rescored after appendix figure cited.");
    expect(o.appliedAt).toBe("2026-05-15T10:00:00Z");
    expect(o.patch).toEqual({ status: "passed", rubricScore: 0.92 });
  });

  it("degrades to overrides=[] when the DB lookup throws", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.gradeFindUnique.mockRejectedValue(new Error("db unreachable"));

    const { req, ctx } = makeCtx("grade-db-down");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.grade.overrides).toEqual([]);
    // Rubric panel still rendered — the override surface is best-effort.
    expect(Array.isArray(body.grade.rubric)).toBe(true);
  });

  it("filters malformed override entries instead of leaking them", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.gradeFindUnique.mockResolvedValue({
      history: [
        // valid
        {
          reviewerId: "rev-1",
          note: "ok",
          appliedAt: "2026-05-15T10:00:00Z",
          override: { rubricScore: 0.8 },
        },
        // missing required fields — must be dropped
        { reviewerId: "rev-2" },
        // non-object — must be dropped
        "junk",
      ],
    });
    const { req, ctx } = makeCtx("grade-mixed");
    const res = await GET(req, ctx);
    const body = await res.json();
    expect(body.grade.overrides).toHaveLength(1);
    expect(body.grade.overrides[0].reviewerId).toBe("rev-1");
  });
});
