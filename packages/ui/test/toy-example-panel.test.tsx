import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ToyExamplePanel } from "../src/components/ToyExamplePanel.js";

describe("ToyExamplePanel", () => {
  it("renders the input matrix as a tight mono grid", () => {
    const html = renderToStaticMarkup(
      <ToyExamplePanel
        inputMatrix={{
          label: "Input X",
          values: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        }}
        onCompute={async () => ({ output: [], matches: true })}
      />,
    );
    expect(html).toContain("data-rc-toy-grid");
    expect(html).toContain("Input X");
    // Two rows in the grid.
    const rowMatches = html.match(/role="row"/g);
    expect(rowMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("renders the Compute button with the green icon-accent Play icon", () => {
    const html = renderToStaticMarkup(
      <ToyExamplePanel
        inputMatrix={{ label: "X", values: [[0]] }}
        onCompute={async () => ({ output: [], matches: true })}
      />,
    );
    expect(html).toContain("data-rc-toy-compute");
    expect(html).toContain("Compute");
    // Icon must carry the green icon-accent class — Tailwind with arbitrary
    // value escapes to text-(--color-rc-icon-accent).
    expect(html).toContain("text-(--color-rc-icon-accent)");
  });

  it("includes the expected-shape annotation when supplied", () => {
    const html = renderToStaticMarkup(
      <ToyExamplePanel
        inputMatrix={{ label: "X", values: [[0]] }}
        expectedShape={[2, 3]}
        onCompute={async () => ({ output: [], matches: true })}
      />,
    );
    expect(html).toContain("Expected output shape");
    expect(html).toContain("[2, 3]");
  });
});
