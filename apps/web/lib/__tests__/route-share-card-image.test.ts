import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for `app/api/share-cards/[id]/image.svg/route.ts`.
 *
 * Pins the public-asset behaviour that the share-card URL builders
 * advertise:
 *  - Missing card → 404.
 *  - Unshared card (publicSlug null) → 404.
 *  - Stale `?s=<oldSlug>` query → 404 (so social crawlers fall off when
 *    a card is unshared + republished with a new slug).
 *  - Happy path returns an SVG with cache headers.
 */

const mocks = vi.hoisted(() => ({
  getShareCardById: vi.fn(),
}));

vi.mock("@/lib/data/share-cards", () => ({
  getShareCardById: mocks.getShareCardById,
}));

import { GET } from "../../app/api/share-cards/[id]/image.svg/route";

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeRequest(url: string): Request {
  return new Request(url);
}

beforeEach(() => {
  mocks.getShareCardById.mockReset();
});

describe("GET /api/share-cards/:id/image.svg", () => {
  it("returns 400 when id is empty", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/share-cards//image.svg"),
      ctx(""),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the card doesn't exist", async () => {
    mocks.getShareCardById.mockResolvedValue(null);
    const res = await GET(
      makeRequest("http://localhost/api/share-cards/missing/image.svg"),
      ctx("missing"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the card has been unshared (publicSlug null)", async () => {
    mocks.getShareCardById.mockResolvedValue({
      id: "sc-1",
      publicSlug: null,
      payload: { packageSlug: "resnet" },
    });
    const res = await GET(
      makeRequest("http://localhost/api/share-cards/sc-1/image.svg"),
      ctx("sc-1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when the optional ?s=<slug> query mismatches the current slug", async () => {
    mocks.getShareCardById.mockResolvedValue({
      id: "sc-1",
      publicSlug: "current-slug",
      payload: { packageSlug: "resnet" },
    });
    const res = await GET(
      makeRequest("http://localhost/api/share-cards/sc-1/image.svg?s=old-slug"),
      ctx("sc-1"),
    );
    expect(res.status).toBe(404);
  });

  it("renders the SVG with cache headers on the happy path", async () => {
    mocks.getShareCardById.mockResolvedValue({
      id: "sc-1",
      publicSlug: "current-slug",
      payload: {
        packageSlug: "resnet",
        completionStatus: "in_progress",
        scoreSummary: { passed: 2, total: 4 },
        learnerInsight: "Init matters.",
      },
    });
    const res = await GET(
      makeRequest(
        "http://localhost/api/share-cards/sc-1/image.svg?s=current-slug",
      ),
      ctx("sc-1"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("max-age=300");
    const body = await res.text();
    expect(body).toContain("<svg");
    expect(body).toContain("resnet");
    expect(body).toContain("Init matters.");
  });

  it("renders the SVG when no ?s= query is provided (no slug check on omitted param)", async () => {
    mocks.getShareCardById.mockResolvedValue({
      id: "sc-1",
      publicSlug: "current-slug",
      payload: { packageSlug: "resnet" },
    });
    const res = await GET(
      makeRequest("http://localhost/api/share-cards/sc-1/image.svg"),
      ctx("sc-1"),
    );
    expect(res.status).toBe(200);
  });
});
