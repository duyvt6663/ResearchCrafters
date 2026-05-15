import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Regression suite for the `/s/[slug]` public landing route.
 *
 * Pins the resolver behaviour the URL builders advertise:
 *  - Unknown / unshared slug → `notFound()` (which throws under Next).
 *  - Known slug → renders the share-card payload + emits OpenGraph
 *    metadata pointing at the image asset.
 */

const mocks = vi.hoisted(() => ({
  getShareCardByPublicSlug: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/data/share-cards", () => ({
  getShareCardByPublicSlug: mocks.getShareCardByPublicSlug,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

// The page imports a React Server Component from
// `@researchcrafters/ui/components`, which transitively pulls in CSS-in-JS
// helpers we don't need to render here. We only assert on the
// `generateMetadata` output + the resolver behaviour, so the component is
// stubbed.
vi.mock("@researchcrafters/ui/components", () => ({
  ShareCardPreview: () => null,
}));

import PublicShareCardPage, {
  generateMetadata,
} from "../../app/s/[slug]/page";

// PublicShareCardPage returns JSX, which requires the React JSX runtime in
// the test environment. We only exercise the `notFound()` branches (which
// throw before JSX is constructed); rendering is intentionally not covered
// at the unit level — see `qa/share-card-public-urls-2026-05-15.md`.

beforeEach(() => {
  mocks.getShareCardByPublicSlug.mockReset();
  mocks.notFound.mockClear();
  process.env["PUBLIC_APP_URL"] = "https://app.example.com";
});

function params(slug: string): Promise<{ slug: string }> {
  return Promise.resolve({ slug });
}

describe("generateMetadata for /s/:slug", () => {
  it("returns a generic title when the slug doesn't resolve", async () => {
    mocks.getShareCardByPublicSlug.mockResolvedValue(null);
    const md = await generateMetadata({ params: params("missing") });
    expect(md.title).toContain("Share card");
    expect(md.openGraph).toBeUndefined();
  });

  it("returns a generic title when the card has been unshared", async () => {
    mocks.getShareCardByPublicSlug.mockResolvedValue({
      id: "sc-1",
      publicSlug: null,
      payload: { packageSlug: "resnet" },
    });
    const md = await generateMetadata({ params: params("old-slug") });
    expect(md.openGraph).toBeUndefined();
  });

  it("emits OpenGraph + Twitter metadata pointing at the absolute image URL", async () => {
    mocks.getShareCardByPublicSlug.mockResolvedValue({
      id: "sc-1",
      publicSlug: "slug-1",
      payload: {
        packageSlug: "resnet",
        learnerInsight: "Init matters more than the optimizer.",
      },
    });
    const md = await generateMetadata({ params: params("slug-1") });
    expect(md.title).toBe("ResearchCrafters · resnet");
    expect(md.description).toContain("Init matters");
    const og = md.openGraph as { images?: Array<{ url: string }> };
    expect(og?.images?.[0]?.url).toBe(
      "https://app.example.com/api/share-cards/sc-1/image.svg?s=slug-1",
    );
    expect(md.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("uses a default description when the learner insight is empty", async () => {
    mocks.getShareCardByPublicSlug.mockResolvedValue({
      id: "sc-1",
      publicSlug: "slug-1",
      payload: { packageSlug: "resnet", learnerInsight: "" },
    });
    const md = await generateMetadata({ params: params("slug-1") });
    expect(md.description).toContain("ResearchCrafters");
  });
});

describe("PublicShareCardPage render", () => {
  it("calls notFound() when the slug doesn't resolve", async () => {
    mocks.getShareCardByPublicSlug.mockResolvedValue(null);
    await expect(
      PublicShareCardPage({ params: params("missing") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalled();
  });

  it("calls notFound() when the card has been unshared", async () => {
    mocks.getShareCardByPublicSlug.mockResolvedValue({
      id: "sc-1",
      publicSlug: null,
      payload: { packageSlug: "resnet" },
    });
    await expect(
      PublicShareCardPage({ params: params("old-slug") }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

});
