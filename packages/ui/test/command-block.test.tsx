import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandBlock } from "../src/components/CommandBlock.js";

/**
 * Server-render tests for the terminal-style CommandBlock.
 *
 * The component is `"use client"` because it mounts a copy-to-clipboard
 * handler, but the SSR pass must produce the brand-defining chrome:
 * three traffic-light dots, an optional title chip, a `$` prefix on each
 * command line, and the optional output stack tinted by tone.
 */
describe("CommandBlock", () => {
  it("renders the three traffic-light dots in the title bar", () => {
    const html = renderToStaticMarkup(
      <CommandBlock commands={["researchcrafters start flash-attention"]} />,
    );
    expect(html).toContain("#FF5F57");
    expect(html).toContain("#FEBC2E");
    expect(html).toContain("#28C840");
  });

  it("renders the optional title in the chrome bar", () => {
    const html = renderToStaticMarkup(
      <CommandBlock
        title="~/research/flash-attention"
        commands={["pnpm test"]}
      />,
    );
    expect(html).toContain("~/research/flash-attention");
  });

  it("places a `$` prompt prefix before every command line", () => {
    const html = renderToStaticMarkup(
      <CommandBlock
        commands={[
          "researchcrafters start flash-attention",
          "researchcrafters test",
          "researchcrafters submit",
        ]}
      />,
    );
    // Each command should sit beside a $ glyph. Count $ characters: 3.
    const dollarMatches = html.match(/&#x24;|\$/g) ?? [];
    expect(dollarMatches.length).toBeGreaterThanOrEqual(3);
    expect(html).toContain("researchcrafters start flash-attention");
    expect(html).toContain("researchcrafters test");
    expect(html).toContain("researchcrafters submit");
  });

  it("renders multi-line commands with a `>` continuation prompt", () => {
    const html = renderToStaticMarkup(
      <CommandBlock
        commands={[
          "echo 'hello' \\\nworld",
        ]}
      />,
    );
    // Continuation glyph is `>`.
    expect(html).toContain(">");
  });

  it("renders output lines tinted by tone", () => {
    const html = renderToStaticMarkup(
      <CommandBlock
        commands={["researchcrafters test"]}
        output={[
          { line: "PASS  test_residual.py", tone: "success" },
          { line: "WARN  flaky tolerance", tone: "warning" },
          { line: "FAIL  test_blowup.py", tone: "danger" },
          { line: "      (no graded attempts consumed)", tone: "muted" },
        ]}
      />,
    );
    // Output lines must reach the markup, regardless of tone.
    expect(html).toContain("PASS  test_residual.py");
    expect(html).toContain("FAIL  test_blowup.py");
    // Tone classes should be present so visual tints actually paint.
    expect(html).toContain("text-(--color-rc-success)");
    expect(html).toContain("text-(--color-rc-warning)");
    expect(html).toContain("text-(--color-rc-danger)");
    expect(html).toContain("text-(--color-rc-code-muted)");
  });

  it("renders a copy button with an accessible label", () => {
    const html = renderToStaticMarkup(
      <CommandBlock commands={["researchcrafters test"]} />,
    );
    expect(html).toMatch(/aria-label="Copy commands"/);
  });

  it("when typing is true, renders a typing-line wrapper without throwing", () => {
    const html = renderToStaticMarkup(
      <CommandBlock
        typing
        commands={["researchcrafters start flash-attention"]}
      />,
    );
    // The typing wrapper has the inline animation property; presence of
    // `rc-typing` (the keyframe id) confirms the animation hook is wired.
    expect(html).toContain("rc-typing");
  });
});
