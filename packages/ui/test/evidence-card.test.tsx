import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvidenceCard } from "../src/components/EvidenceCard.js";

describe("EvidenceCard", () => {
  it("renders a training curve with a path per trajectory", () => {
    const html = renderToStaticMarkup(
      <EvidenceCard
        kind="training-curve"
        caption="Top-1 accuracy on CIFAR-10."
        data={{
          trajectories: [
            {
              name: "plain-34",
              tone: "plain",
              points: [
                [0, 0.1],
                [50, 0.4],
                [100, 0.55],
              ],
            },
            {
              name: "resnet-34",
              tone: "residual",
              points: [
                [0, 0.1],
                [50, 0.6],
                [100, 0.78],
              ],
            },
          ],
        }}
      />,
    );
    // Both trajectories should produce a path; the residual one should use
    // the accent token.
    const pathMatches = html.match(/<path/g) ?? [];
    expect(pathMatches.length).toBe(2);
    expect(html).toContain("var(--color-rc-accent)");
    // Caption present.
    expect(html).toContain("Top-1 accuracy");
    // Legend rows.
    expect(html).toContain("plain-34");
    expect(html).toContain("resnet-34");
  });

  it("renders a metric table with numeric values mono-styled", () => {
    const html = renderToStaticMarkup(
      <EvidenceCard
        kind="metric-table"
        caption="Validation perplexity at convergence."
        data={{
          columns: ["seed=0", "seed=1"],
          rows: [
            { label: "ppl", values: ["12.4", "12.7"] },
            { label: "acc", values: ["0.81", "0.80"] },
          ],
        }}
      />,
    );
    expect(html).toContain("seed=0");
    expect(html).toContain("12.4");
    expect(html).toContain("0.80");
    // Mono treatment for the numeric cells.
    expect(html).toContain("font-[--font-rc-mono]");
  });

  it("renders the figure placeholder with an accessible role", () => {
    const html = renderToStaticMarkup(
      <EvidenceCard
        kind="figure"
        caption="Figure 3."
        data={{ alt: "Architecture diagram" }}
      />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Architecture diagram"');
    // Caption sits underneath.
    expect(html).toContain("Figure 3.");
  });
});
