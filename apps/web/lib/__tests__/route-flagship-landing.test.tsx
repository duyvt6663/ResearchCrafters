import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Smoke test for the flagship marketing landing page at `/flagship`.
 *
 * The page is static (no DB), so we render it to HTML and assert on the
 * load-bearing pieces: title, CTA href, the puzzle headline, and the
 * stage list. UI components from `@researchcrafters/ui/components` are
 * stubbed because they pull in CSS-in-JS / shiki the test env doesn't
 * need to exercise.
 */

vi.mock("@researchcrafters/ui/components", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CodeBlock: ({ code }: { code: string }) => <pre data-stub="codeblock">{code}</pre>,
  CommandBlock: ({ commands }: { commands: readonly string[] }) => (
    <pre data-stub="commandblock">{commands.join("\n")}</pre>
  ),
}));

import FlagshipLandingPage, { metadata } from "../../app/flagship/page";

describe("/flagship marketing landing", () => {
  it("exposes a marketing-safe page title and OG description", () => {
    expect(metadata.title).toMatch(/ResNet/);
    expect(typeof metadata.description).toBe("string");
    // The redaction policy in content/packages/resnet/package.yaml lists
    // canonical-answer phrasing that must not appear in marketing copy.
    expect(metadata.description).not.toMatch(/F\(x\) \+ x/);
    expect(metadata.description).not.toMatch(/identity shortcut/i);
    expect(metadata.description).not.toMatch(/residual mapping/i);
  });

  it("renders the hero, puzzle, stage list and a start-CTA pointing at the flagship package", () => {
    const html = renderToStaticMarkup(<FlagshipLandingPage />);

    expect(html).toContain('data-testid="flagship-hero"');
    expect(html).toContain('data-testid="flagship-stage-list"');
    expect(html).toContain("Rebuild ResNet from the decision that made it work.");
    expect(html).toContain("Deeper should be better. It wasn&#x27;t.");

    // Both the hero CTA and the footer CTA must funnel to the in-app
    // package overview — that's where enrollment / paywall flow lives.
    expect(html).toContain('data-testid="flagship-cta-primary"');
    expect(html).toContain('data-testid="flagship-cta-footer"');
    expect(html.match(/href="\/packages\/resnet"/g) ?? []).toHaveLength(2);

    // Secondary CTA goes to the catalog.
    expect(html).toContain('href="/"');
  });

  it("does not leak canonical-answer redaction targets", () => {
    const html = renderToStaticMarkup(<FlagshipLandingPage />);
    // From content/packages/resnet/package.yaml § safety.redaction_targets.
    expect(html).not.toMatch(/F\(x\) \+ x/);
    expect(html).not.toMatch(/identity shortcut/i);
    expect(html).not.toMatch(/residual mapping/i);
    expect(html).not.toMatch(/shortcut connection/i);
    // The code sample intentionally shows `y + identity`; that's the
    // public skeleton already shown on /packages/[slug], not a leak.
    expect(html).toContain("y + identity");
  });
});
