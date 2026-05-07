import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MathWorkspace } from "../src/components/MathWorkspace.js";

describe("MathWorkspace", () => {
  it("renders all four sub-zones when their props are supplied", () => {
    const html = renderToStaticMarkup(
      <MathWorkspace
        derivation={{
          steps: [
            {
              id: "s1",
              kind: "given",
              label: "Step 1",
              expressionLatex: "y = x",
            },
          ],
        }}
        shapeTable={{
          rows: [
            {
              name: "input",
              dims: ["B", "C"],
              values: ["32", "3"],
            },
          ],
          onChange: () => {},
        }}
        toyExample={{
          inputMatrix: { label: "X", values: [[1, 2]] },
          onCompute: async () => ({ output: [], matches: true }),
        }}
        explanation={{ value: "", onChange: () => {} }}
        onSubmit={() => {}}
      />,
    );
    expect(html).toContain('data-rc-math-zone-name="derivation"');
    expect(html).toContain('data-rc-math-zone-name="shape-table"');
    expect(html).toContain('data-rc-math-zone-name="toy-example"');
    expect(html).toContain('data-rc-math-zone-name="explanation"');
  });

  it("tints the sticky submit pill by state", () => {
    const passed = renderToStaticMarkup(
      <MathWorkspace state="passed" onSubmit={() => {}} />,
    );
    expect(passed).toContain('data-rc-math-submit="true"');
    expect(passed).toContain("Passed");
    expect(passed).toContain("color-rc-icon-accent");

    const failed = renderToStaticMarkup(
      <MathWorkspace state="failed" onSubmit={() => {}} />,
    );
    expect(failed).toContain('data-state="failed"');
    expect(failed).toContain("Try again");
    expect(failed).toContain("color-rc-danger");

    const validating = renderToStaticMarkup(
      <MathWorkspace state="validating" onSubmit={() => {}} />,
    );
    expect(validating).toContain('data-state="validating"');
    expect(validating).toContain("Validating");
  });

  it("emits both mobile and desktop layout markers so the grid flips", () => {
    const html = renderToStaticMarkup(
      <MathWorkspace
        explanation={{ value: "", onChange: () => {} }}
        onSubmit={() => {}}
      />,
    );
    // The layout container is annotated with single (mobile) and two-col
    // (desktop) markers so a Playwright run can flip viewport sizes and
    // assert against the right shape without sniffing class names.
    expect(html).toContain('data-mobile-layout="single"');
    expect(html).toContain('data-desktop-layout="two-col"');
  });
});
