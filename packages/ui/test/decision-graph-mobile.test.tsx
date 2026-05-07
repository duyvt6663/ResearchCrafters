import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DecisionGraphMobile,
  type DecisionGraphNode,
} from "../src/components/DecisionGraphMobile.js";

/**
 * Server-render tests for the mobile decision-graph fallback.
 *
 * The component is `"use client"` because it has a click handler, but the
 * SSR pass must not throw and must respect the spoiler discipline:
 * branches with `revealed: false` MUST NOT include their `summary` in the
 * rendered output, even if a misconfigured caller passes one through.
 */

const sample: DecisionGraphNode[] = [
  {
    ref: "S001",
    title: "Why is going deeper not enough?",
    type: "framing",
    status: "completed",
  },
  {
    ref: "S002",
    title: "Which fix do you attack first?",
    type: "decision",
    status: "current",
    branches: [
      {
        id: "branch-residual",
        label: "Reformulate as F(x) + x",
        summary: "Identity-shortcut blocks unlock end-to-end training at depth.",
        type: "canonical",
        revealed: true,
      },
      {
        id: "branch-deeper",
        label: "Just add more layers",
        summary: "VERY_SECRET_LEAK_PHRASE — should not appear in render",
        type: "failed",
        revealed: false,
      },
    ],
  },
  {
    ref: "S003",
    title: "Implement a residual block.",
    type: "implementation",
    status: "locked",
  },
];

describe("DecisionGraphMobile", () => {
  it("renders an entry per node plus an End-of-journey trailer", () => {
    const html = renderToStaticMarkup(<DecisionGraphMobile nodes={sample} />);
    // Each node title must appear; the trailer ends the spine.
    expect(html).toContain("Why is going deeper");
    expect(html).toContain("Which fix do you attack first?");
    expect(html).toContain("Implement a residual block");
    expect(html).toContain("End of journey");
    // The numeric step counter is `01`/`02`/`03` for the three top-level
    // nodes — branch sub-items (which are also <li> elements inside S002)
    // are NOT numbered.
    expect(html).toMatch(/>\s*01\s*</);
    expect(html).toMatch(/>\s*02\s*</);
    expect(html).toMatch(/>\s*03\s*</);
  });

  it("never leaks summary text for hidden branches (spoiler discipline)", () => {
    const html = renderToStaticMarkup(<DecisionGraphMobile nodes={sample} />);
    // Canonical branch is revealed; its summary is fine.
    expect(html).toContain("Identity-shortcut blocks unlock end-to-end");
    // Failed branch is hidden — even though summary is populated, it must
    // not reach the rendered output.
    expect(html).not.toContain("VERY_SECRET_LEAK_PHRASE");
    // The label is allowed (the user knows a branch exists), but the
    // outline placeholder reads "Hidden" instead of the canonical label.
    expect(html).toContain("Hidden");
  });

  it("marks locked nodes with disabled styling and a lock icon", () => {
    const html = renderToStaticMarkup(<DecisionGraphMobile nodes={sample} />);
    expect(html).toContain("opacity-60");
    expect(html).toContain("cursor-not-allowed");
  });

  it("renders an empty-state placeholder when no nodes are passed", () => {
    const html = renderToStaticMarkup(<DecisionGraphMobile nodes={[]} />);
    expect(html).toContain("No decisions in this package yet.");
    // No "End of journey" trailer when there's nothing to end.
    expect(html).not.toContain("End of journey");
  });

  it("uses an ordered numbering that's stable across renders", () => {
    const html = renderToStaticMarkup(<DecisionGraphMobile nodes={sample} />);
    expect(html).toContain("01");
    expect(html).toContain("02");
    expect(html).toContain("03");
  });
});
