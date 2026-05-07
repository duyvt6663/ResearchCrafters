import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PackageCard } from "../src/components/PackageCard.js";

/**
 * Server-render tests for the refreshed `PackageCard`. The card is now its
 * own primitive (no `Card` wrapper) so we can paint a status-tinted top
 * border and apply a hover-lift via `data-hover-lift`. These tests pin the
 * brand-defining behaviour:
 *
 *   - status-coded top border colour is set as an inline `background-color`
 *   - skill chips render with a leading sparkle glyph
 *   - footer separators use `·`, not pipes
 *   - hover-lift is opt-in (only when `href` is supplied)
 */
describe("PackageCard (refresh)", () => {
  it("renders a status-tinted top border based on releaseStatus", () => {
    const html = renderToStaticMarkup(
      <PackageCard
        title="Residual learning"
        skills={["framing"]}
        difficulty="intermediate"
        releaseStatus="beta"
        href="/packages/resnet"
      />,
    );
    // Beta tint = accent token.
    expect(html).toContain("var(--color-rc-accent)");
    // The release badge is rendered uppercase mono.
    expect(html).toContain("beta");
  });

  it("only opts into the hover-lift when a link target is supplied", () => {
    const linked = renderToStaticMarkup(
      <PackageCard
        title="Residual learning"
        skills={[]}
        difficulty="intermediate"
        href="/packages/resnet"
      />,
    );
    const staticCard = renderToStaticMarkup(
      <PackageCard
        title="Residual learning"
        skills={[]}
        difficulty="intermediate"
      />,
    );
    expect(linked).toContain('data-hover-lift="true"');
    expect(staticCard).not.toContain("data-hover-lift");
  });

  it("renders skill chips with a sparkle glyph", () => {
    const html = renderToStaticMarkup(
      <PackageCard
        title="Residual learning"
        skills={["framing", "implementation"]}
        difficulty="intermediate"
      />,
    );
    // Lucide Sparkles renders as an inline SVG.
    expect(html.match(/<svg/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(html).toContain("framing");
    expect(html).toContain("implementation");
  });

  it("uses `·` as the footer separator", () => {
    const html = renderToStaticMarkup(
      <PackageCard
        title="Residual learning"
        skills={[]}
        difficulty="intermediate"
        estimatedMinutes={45}
        freeStageCount={2}
      />,
    );
    expect(html).toContain("·");
    expect(html).not.toContain("|");
    expect(html).toContain("45 min");
    expect(html).toContain("2 free");
  });
});
