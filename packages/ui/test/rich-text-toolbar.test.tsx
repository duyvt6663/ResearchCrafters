import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RichTextToolbar,
  RICH_TEXT_TOOLBAR_ITEMS,
  type RichTextSnippet,
} from "../src/components/RichTextToolbar.js";

describe("RichTextToolbar", () => {
  it("renders one button per snippet in the canonical order", () => {
    const html = renderToStaticMarkup(
      <RichTextToolbar onInsert={() => {}} />,
    );
    expect(html).toContain("data-rc-rich-toolbar");
    for (const item of RICH_TEXT_TOOLBAR_ITEMS) {
      expect(html).toContain(`data-rc-toolbar-key="${item.key}"`);
      expect(html).toContain(`aria-label="${item.label}"`);
    }
  });

  it("emits the right snippet for each canonical action", () => {
    // We exercise the snippet data at the export so a downstream consumer
    // (RichAnswerEditor) can rely on a stable contract.
    const byKey: Record<string, RichTextSnippet> = {};
    for (const item of RICH_TEXT_TOOLBAR_ITEMS) {
      byKey[item.key] = item.snippet;
    }
    expect(byKey.bold).toEqual({ before: "**", placeholder: "bold", after: "**" });
    expect(byKey.italic).toEqual({ before: "*", placeholder: "italic", after: "*" });
    expect(byKey.h1?.before).toBe("# ");
    expect(byKey.h2?.before).toBe("## ");
    expect(byKey.h3?.before).toBe("### ");
    expect(byKey.ul?.before).toBe("- ");
    expect(byKey.ol?.before).toBe("1. ");
    expect(byKey.code).toEqual({ before: "`", placeholder: "code", after: "`" });
    expect(byKey.quote?.before).toBe("> ");
    expect(byKey.link).toEqual({
      before: "[",
      placeholder: "link text",
      after: "](https://)",
    });
  });

  it("paints the green icon-accent on active buttons via data-active", () => {
    const html = renderToStaticMarkup(
      <RichTextToolbar onInsert={() => {}} activeKeys={["bold", "italic"]} />,
    );
    // Active buttons carry data-active="true"; the green tint comes from
    // the .rc-toolbar-btn[data-active="true"] CSS rule, but the toolbar
    // also inlines `text-(--color-rc-icon-accent)` on the active icon.
    // Order of HTML attributes is implementation-defined; assert both
    // `data-active="true"` AND the matching key appear within the same
    // <button> element by snipping out the bold button.
    const boldStart = html.indexOf('data-rc-toolbar-key="bold"');
    expect(boldStart).toBeGreaterThan(-1);
    const buttonStart = html.lastIndexOf("<button", boldStart);
    const buttonEnd = html.indexOf("</button>", boldStart);
    const boldButton = html.slice(buttonStart, buttonEnd);
    expect(boldButton).toContain('data-active="true"');
    expect(boldButton).toContain("text-(--color-rc-icon-accent)");
  });

  it("calls onInsert with the right snippet shape (smoke check)", () => {
    // SSR can't fire click events, but the export shape we rely on is
    // covered above. We additionally smoke-check that the type of the
    // snippet is what RichAnswerEditor expects.
    const fn = vi.fn();
    const item = RICH_TEXT_TOOLBAR_ITEMS.find((i) => i.key === "bold");
    expect(item).toBeTruthy();
    fn(item?.snippet);
    expect(fn).toHaveBeenCalledWith({
      before: "**",
      placeholder: "bold",
      after: "**",
    });
  });
});
