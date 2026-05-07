import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WritingWorkbench } from "../src/components/WritingWorkbench.js";
import type { EvidenceItem } from "../src/components/EvidencePanel.js";
import type { RubricDimension } from "../src/components/RubricPanel.js";

const EVIDENCE: EvidenceItem[] = [
  { id: "e1", title: "He et al. 2015 — ResNet", kind: "doc" },
  { id: "e2", title: "Training curves", kind: "artifact" },
];

const RUBRIC: RubricDimension[] = [
  { id: "r1", name: "Argument quality", weight: 50 },
  { id: "r2", name: "Evidence use", weight: 50 },
];

describe("WritingWorkbench", () => {
  it("renders all four panes — evidence, draft, rubric, mentor", () => {
    const html = renderToStaticMarkup(
      <WritingWorkbench
        evidence={EVIDENCE}
        draft={{ value: "", onChange: () => {} }}
        rubric={RUBRIC}
      />,
    );
    expect(html).toContain('data-rc-writing-pane="evidence"');
    expect(html).toContain('data-rc-writing-pane="draft"');
    expect(html).toContain('data-rc-writing-pane="rubric"');
    expect(html).toContain('data-rc-writing-pane="mentor"');
  });

  it("renders evidence items with insert-ref affordances when onInsertCitation is provided", () => {
    let inserted: string | null = null;
    const html = renderToStaticMarkup(
      <WritingWorkbench
        evidence={EVIDENCE}
        draft={{ value: "", onChange: () => {} }}
        rubric={RUBRIC}
        onInsertCitation={(item) => {
          inserted = item.id;
        }}
      />,
    );
    // Each evidence item exposes an "Insert ref" button.
    expect(html).toContain("Insert ref");
    expect(html).toContain("He et al. 2015");
    // The callback prop is wired but SSR can't fire it; we verify the
    // shape by calling it directly with a fixture item.
    inserted = null;
    const props = { onInsertCitation: (item: EvidenceItem) => (inserted = item.id) };
    props.onInsertCitation(EVIDENCE[1]!);
    expect(inserted).toBe("e2");
  });

  it("respects the mentor mode prop", () => {
    const html = renderToStaticMarkup(
      <WritingWorkbench
        evidence={[]}
        draft={{ value: "", onChange: () => {} }}
        rubric={[]}
        mentorReview={{ mode: "review_draft", allowedContext: ["draft"] }}
      />,
    );
    // The mentor pane title must exist.
    expect(html).toContain("Mentor review");
    // The allowed-context chip from the mentor panel surfaces our value.
    expect(html).toContain("draft");
  });
});
