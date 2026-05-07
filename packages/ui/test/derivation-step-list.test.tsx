import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DerivationStepList,
  type DerivationStep,
} from "../src/components/DerivationStepList.js";

const SAMPLE: DerivationStep[] = [
  {
    id: "s1",
    kind: "given",
    label: "Step 1: chain rule",
    expressionLatex: "\\frac{dy}{dx} = f'(g(x)) \\cdot g'(x)",
  },
  {
    id: "s2",
    kind: "blank",
    label: "Step 2: substitute",
    blankPlaceholder: "Enter result",
    value: "f'(g(x)) g'(x)",
    validation: "passed",
    hint: "Substitute g(x) into f'.",
  },
  {
    id: "s3",
    kind: "blank",
    label: "Step 3",
    value: "wrong answer",
    validation: "wrong",
  },
  {
    id: "s4",
    kind: "blank",
    label: "Step 4",
    validation: "partial",
  },
];

describe("DerivationStepList", () => {
  it("renders a lock icon on given steps", () => {
    const html = renderToStaticMarkup(
      <DerivationStepList steps={SAMPLE} />,
    );
    // The given step should have its lock marker.
    expect(html).toContain("data-rc-derivation-lock");
    expect(html).toContain('data-step-kind="given"');
  });

  it("renders an editable input for blank steps with a live KaTeX preview", () => {
    const html = renderToStaticMarkup(
      <DerivationStepList steps={SAMPLE} />,
    );
    // Input element for s2 — placeholder shouldn't matter, but the input
    // must exist and the value attribute should be present.
    expect(html).toContain("data-rc-derivation-input");
    expect(html).toContain("data-rc-derivation-preview");
    // The live preview echoes the user's LaTeX (rendered via the KaTeX
    // fallback in tests). Apostrophes are HTML-escaped to `&#x27;` in the
    // SSR pass — match against the escaped form.
    expect(html).toContain("f&#x27;(g(x)) g&#x27;(x)");
  });

  it("renders the right validation chip per step", () => {
    const html = renderToStaticMarkup(
      <DerivationStepList steps={SAMPLE} />,
    );
    expect(html).toContain('data-rc-derivation-validation="passed"');
    expect(html).toContain('data-rc-derivation-validation="wrong"');
    expect(html).toContain('data-rc-derivation-validation="partial"');
    // Given steps don't get a validation chip — only the lock.
    expect(html).not.toMatch(/data-rc-derivation-validation="passed"[^]*?data-step-kind="given"/);
  });

  it("emits a hint toggle for steps that carry a hint", () => {
    const html = renderToStaticMarkup(
      <DerivationStepList steps={SAMPLE} />,
    );
    // The toggle button is rendered (closed by default).
    expect(html).toContain("data-rc-derivation-hint-toggle");
    // The hint body is hidden until the user clicks the toggle, so it
    // should NOT appear in the SSR output.
    expect(html).not.toContain("data-rc-derivation-hint=");
  });

  it("never leaks a canonical solution string in the rendered output", () => {
    // The component is given no `expectedLatex` field at all — there is
    // nothing in the public `DerivationStep` shape to leak. Sanity-check
    // that no auto-generated "answer" / "expected" / "solution" copy
    // sneaks into the SSR pass.
    const html = renderToStaticMarkup(
      <DerivationStepList steps={SAMPLE} />,
    );
    expect(html.toLowerCase()).not.toContain("expected:");
    expect(html.toLowerCase()).not.toContain("canonical:");
    expect(html.toLowerCase()).not.toContain("solution:");
  });
});
