import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/packages/route.ts`.
 *
 * The route had a silent bug where it returned `{ packages: listPackages() }`
 * — an unresolved Promise — that serialised to `{}` and broke the catalog
 * end-to-end. The fix added the `await`. These tests pin both the await and
 * the Bearer-aware auth path so regressions trip CI before they reach prod.
 */

const mocks = vi.hoisted(() => ({
  listPackages: vi.fn(),
  getSessionFromRequest: vi.fn(),
  canAccess: vi.fn(),
}));

vi.mock("@/lib/data/packages", () => ({
  listPackages: mocks.listPackages,
}));

vi.mock("@/lib/auth", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/lib/permissions", () => ({
  permissions: { canAccess: mocks.canAccess },
  denialHttpStatus: () => 403,
}));

import { GET } from "../../app/api/packages/route";

beforeEach(() => {
  mocks.listPackages.mockReset();
  mocks.getSessionFromRequest.mockReset();
  mocks.canAccess.mockReset();
});

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/packages", { headers });
}

describe("GET /api/packages", () => {
  it("returns the AWAITED package list (regression: was returning {} from the unresolved Promise)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.listPackages.mockResolvedValue([
      {
        slug: "resnet",
        title: "ResNet",
        paperTitle: "Deep Residual Learning",
        oneLinePromise: "x",
        skills: [],
        difficulty: "intermediate",
        estimatedMinutes: 90,
        freeStageCount: 2,
        releaseStatus: "live",
      },
    ]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.packages)).toBe(true);
    expect(body.packages).toHaveLength(1);
    expect(body.packages[0].slug).toBe("resnet");
    // The bug surface: an unawaited Promise serialises to {}.
    expect(body.packages).not.toEqual({});
  });

  it("forwards the Authorization header to getSessionFromRequest (Bearer path)", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: "u-paid" });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.listPackages.mockResolvedValue([]);

    const req = makeRequest({ authorization: "Bearer fake-token" });
    await GET(req);
    expect(mocks.getSessionFromRequest).toHaveBeenCalledTimes(1);
    const calledWith = mocks.getSessionFromRequest.mock.calls[0]?.[0];
    expect(calledWith).toBeInstanceOf(Request);
    // The same Request instance reaches the helper (so the helper can read
    // the header).
    expect(calledWith).toBe(req);
  });

  it("returns 403 with the access.reason when canAccess denies", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    mocks.canAccess.mockResolvedValue({
      allowed: false,
      reason: "no_entitlement",
    });
    mocks.listPackages.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("no_entitlement");
    // Did NOT call listPackages (saved the DB round-trip).
    expect(mocks.listPackages).not.toHaveBeenCalled();
  });

  it("returns an empty array (not undefined / not {}) when the catalog is empty", async () => {
    mocks.getSessionFromRequest.mockResolvedValue({ userId: null });
    mocks.canAccess.mockResolvedValue({ allowed: true });
    mocks.listPackages.mockResolvedValue([]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packages).toEqual([]);
  });
});
