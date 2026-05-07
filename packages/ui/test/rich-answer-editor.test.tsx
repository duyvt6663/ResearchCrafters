import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RichAnswerEditor } from "../src/components/RichAnswerEditor.js";

describe("RichAnswerEditor", () => {
  it("renders the toolbar above the textarea in edit mode", () => {
    const html = renderToStaticMarkup(
      <RichAnswerEditor value="hello" onChange={() => {}} />,
    );
    expect(html).toContain("data-rc-rich-toolbar");
    expect(html).toContain("data-rc-rich-edit");
    // No preview pane in pure edit mode.
    expect(html).not.toContain("data-rc-rich-preview-pane");
  });

  it("renders both edit and preview panes in split mode", () => {
    const html = renderToStaticMarkup(
      <RichAnswerEditor
        value="**bold** _italic_"
        onChange={() => {}}
        initialMode="split"
      />,
    );
    expect(html).toContain("data-rc-rich-edit");
    expect(html).toContain("data-rc-rich-preview-pane");
    // The preview pane carries a marker so authors can opt into different
    // styling for the split column.
    expect(html).toContain("data-rc-rich-preview");
  });

  it("emits the markdown source in the preview pane (fallback or rendered)", () => {
    const html = renderToStaticMarkup(
      <RichAnswerEditor
        value="# Heading"
        onChange={() => {}}
        initialMode="preview"
      />,
    );
    expect(html).toContain("data-rc-rich-preview");
    // Either react-markdown is loaded and we get an <h1>, or the fallback
    // <pre> echoes the raw markdown verbatim. Both contain the substring.
    expect(html).toContain("Heading");
  });
});
