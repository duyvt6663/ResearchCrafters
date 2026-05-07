import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeBlock } from "../src/components/CodeBlock.js";

/**
 * Server-render tests for `CodeBlock`. The component is async (server
 * component) because Shiki's highlighter has an async resolver. We `await`
 * the JSX before passing it to `renderToStaticMarkup` so the test does not
 * try to render a Promise.
 */
describe("CodeBlock", () => {
  it("renders both light and dark Shiki HTML envelopes for theme swap", async () => {
    const node = await CodeBlock({
      code: "def add(a, b):\n    return a + b",
      lang: "python",
    });
    const html = renderToStaticMarkup(node);
    // Both theme variants must be present so the page's `data-theme` attribute
    // can hide whichever doesn't apply.
    expect(html).toContain("rc-codeblock-shiki--light");
    expect(html).toContain("rc-codeblock-shiki--dark");
    // The Shiki envelope marker (or our fallback) must be there.
    expect(html).toContain('class="shiki');
  });

  it("renders the filename chip when supplied", async () => {
    const node = await CodeBlock({
      code: "print('hello')",
      lang: "python",
      filename: "residual.py",
    });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("residual.py");
  });

  it("emits a line-number gutter by default", async () => {
    const node = await CodeBlock({
      code: "a\nb\nc",
      lang: "python",
    });
    const html = renderToStaticMarkup(node);
    // Three lines → three gutter rows numbered 1/2/3.
    expect(html).toContain(">1<");
    expect(html).toContain(">2<");
    expect(html).toContain(">3<");
  });

  it("respects showLineNumbers=false", async () => {
    const node = await CodeBlock({
      code: "a\nb",
      lang: "python",
      showLineNumbers: false,
    });
    const html = renderToStaticMarkup(node);
    // Removing the gutter removes the rendered numbers; the text "1" alone
    // is too noisy to assert on, so we check for the gutter wrapper class.
    expect(html).not.toContain("border-r border-white/5");
  });

  it("data-lang reflects the requested language", async () => {
    const node = await CodeBlock({
      code: "let x = 1;",
      lang: "typescript",
    });
    const html = renderToStaticMarkup(node);
    expect(html).toContain('data-lang="typescript"');
  });

  it("renders a lang chip with the language label", async () => {
    const node = await CodeBlock({
      code: "let x = 1;",
      lang: "typescript",
    });
    const html = renderToStaticMarkup(node);
    expect(html).toContain("data-rc-codeblock-chip");
    expect(html).toContain(">TS<");
  });

  it("paints the left edge stripe in the language color", async () => {
    const py = await CodeBlock({ code: "x = 1", lang: "python" });
    const ts = await CodeBlock({ code: "let x = 1;", lang: "typescript" });
    const pyHtml = renderToStaticMarkup(py);
    const tsHtml = renderToStaticMarkup(ts);
    expect(pyHtml).toContain("data-rc-codeblock-stripe");
    expect(pyHtml).toContain("#3776AB");
    expect(tsHtml).toContain("#3178C6");
  });

  it("renders the green icon-accent flourish in the lang chip bar", async () => {
    const node = await CodeBlock({
      code: "x = 1",
      lang: "python",
    });
    const html = renderToStaticMarkup(node);
    // The flourish icon is tinted with the green icon-accent token.
    expect(html).toContain("text-(--color-rc-icon-accent)");
    // The bar wrapper is data-tagged so visual smoke tests can target it.
    expect(html).toContain("data-rc-codeblock-bar");
  });

  it("falls back to plain shell rendering for an unknown language", async () => {
    const node = await CodeBlock({
      code: "frobnicate the widget",
      lang: "made-up-lang",
    });
    const html = renderToStaticMarkup(node);
    // We do not crash; a Shiki envelope is still emitted.
    expect(html).toContain("class=\"shiki");
    expect(html).toContain('data-lang="made-up-lang"');
  });
});
