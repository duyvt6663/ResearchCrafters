import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShapeTableEditor,
  type ShapeRow,
} from "../src/components/ShapeTableEditor.js";

const ROWS: ShapeRow[] = [
  {
    name: "input",
    dims: ["B", "H", "W", "C"],
    values: ["32", "224", "224", "3"],
    paramCount: "0",
    notes: "row-major; $O(BHWC)$ memory",
  },
  {
    name: "conv1",
    dims: ["Co", "Ci", "Kh", "Kw"],
    values: ["64", "3", "7", "7"],
    paramCount: "9408",
  },
];

describe("ShapeTableEditor", () => {
  it("renders an editable input for each cell", () => {
    const html = renderToStaticMarkup(
      <ShapeTableEditor rows={ROWS} onChange={() => {}} />,
    );
    // Each row should produce data-rc-shape-cell inputs.
    expect(html).toContain("data-rc-shape-cell");
    // The value attribute must reflect the seed values.
    expect(html).toContain('value="32"');
    expect(html).toContain('value="224"');
    expect(html).toContain('value="9408"');
  });

  it("renders the validation pill for each row", () => {
    const html = renderToStaticMarkup(
      <ShapeTableEditor
        rows={ROWS}
        onChange={() => {}}
        validation={{ input: "passed", conv1: "wrong" }}
      />,
    );
    expect(html).toContain('data-rc-shape-validation="passed"');
    expect(html).toContain('data-rc-shape-validation="wrong"');
  });

  it("renders KaTeX inline math in the notes preview", () => {
    const html = renderToStaticMarkup(
      <ShapeTableEditor rows={ROWS} onChange={() => {}} />,
    );
    // The notes preview block must exist for the row that has notes.
    expect(html).toContain("data-rc-shape-notes-preview");
    // Either the rendered KaTeX HTML or the fallback `<code>` tag must
    // contain the LaTeX source.
    expect(html).toContain("O(BHWC)");
  });
});
