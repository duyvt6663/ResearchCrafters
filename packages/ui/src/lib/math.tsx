import * as React from "react";

/**
 * Math rendering helpers.
 *
 * KaTeX is the canonical math renderer for the workbench. We wrap
 * `react-katex` so:
 *  - When the package is installed, `BlockMath` / `InlineMath` produce real
 *    rendered formulas (server-safe — react-katex emits HTML directly).
 *  - When the package is NOT installed (declared but pre-install state, or a
 *    consumer that excludes it from its bundle), we fall back to a `<code>`
 *    tag with the raw LaTeX source so the page still renders cleanly and
 *    nothing throws.
 *
 * The loader is synchronous because the components render in SSR/CSR React
 * trees that cannot await. We attempt to resolve `react-katex` once via a
 * `createRequire`-style global lookup, cache the result, and from then on
 * the lookup is free. If the resolve fails (e.g. dep not installed), we set
 * a sentinel and never try again until the process restarts.
 *
 * Tests run in vitest's node environment without the dep installed and must
 * exercise the fallback path — they assert on the `data-rc-math-fallback`
 * attribute that the fallback emits.
 */

type ReactKatex = {
  BlockMath: React.ComponentType<{
    math: string;
    renderError?: (err: Error) => React.ReactNode;
  }>;
  InlineMath: React.ComponentType<{
    math: string;
    renderError?: (err: Error) => React.ReactNode;
  }>;
};

let cachedKatex: ReactKatex | null = null;
let attemptedLoad = false;

function tryLoadKatex(): ReactKatex | null {
  if (attemptedLoad) return cachedKatex;
  attemptedLoad = true;
  // Dodge static module analysis — TypeScript would fail on a literal
  // `require("react-katex")` in NodeNext ESM, and we don't want bundlers to
  // fail when the dep isn't installed.
  try {
    const g = globalThis as unknown as {
      __RC_REACT_KATEX__?: ReactKatex;
      require?: (id: string) => unknown;
    };
    if (g.__RC_REACT_KATEX__) {
      cachedKatex = g.__RC_REACT_KATEX__;
      return cachedKatex;
    }
    // Last-ditch: if a CommonJS-compatible `require` is exposed on
    // `globalThis` (Next.js does this on the server), use it.
    const req = g.require;
    if (typeof req === "function") {
      const mod = req("react-katex") as Partial<ReactKatex> | undefined;
      if (
        mod &&
        typeof mod.BlockMath === "function" &&
        typeof mod.InlineMath === "function"
      ) {
        cachedKatex = { BlockMath: mod.BlockMath, InlineMath: mod.InlineMath };
        return cachedKatex;
      }
    }
  } catch {
    cachedKatex = null;
  }
  return cachedKatex;
}

/**
 * Allow a consumer (typically the web app's root layout, after a static
 * `import` of `react-katex`) to register the resolved module so the math
 * components below pick it up without paying the runtime resolution cost.
 *
 * Usage on the host app:
 *   import * as ReactKatex from "react-katex";
 *   import { registerReactKatex } from "@researchcrafters/ui/components";
 *   registerReactKatex(ReactKatex);
 */
export function registerReactKatex(mod: Partial<ReactKatex>): void {
  if (
    mod &&
    typeof mod.BlockMath === "function" &&
    typeof mod.InlineMath === "function"
  ) {
    cachedKatex = { BlockMath: mod.BlockMath, InlineMath: mod.InlineMath };
    attemptedLoad = true;
    (globalThis as { __RC_REACT_KATEX__?: ReactKatex }).__RC_REACT_KATEX__ =
      cachedKatex;
  }
}

/**
 * Render a LaTeX expression as inline math. Falls back to `<code>` when
 * react-katex is unavailable.
 */
export function renderInlineMath(latex: string): React.ReactNode {
  if (!latex) return null;
  const k = tryLoadKatex();
  if (k) {
    const InlineMath = k.InlineMath;
    return (
      <InlineMath math={latex} renderError={() => <code>{latex}</code>} />
    );
  }
  return (
    <code
      className="font-(--font-rc-mono) text-(--text-rc-sm)"
      data-rc-math-fallback="inline"
    >
      {latex}
    </code>
  );
}

/**
 * Render a LaTeX expression as block math. Falls back to `<pre>` when
 * react-katex is unavailable.
 */
export function renderBlockMath(latex: string): React.ReactNode {
  if (!latex) return null;
  const k = tryLoadKatex();
  if (k) {
    const BlockMath = k.BlockMath;
    return <BlockMath math={latex} renderError={() => <pre>{latex}</pre>} />;
  }
  return (
    <pre
      className="font-(--font-rc-mono) text-(--text-rc-sm) whitespace-pre-wrap"
      data-rc-math-fallback="block"
    >
      {latex}
    </pre>
  );
}

/**
 * Render a string with `$inline$` math segments expanded. Used by the shape
 * table editor's notes column where authors mix prose with light math.
 */
export function renderMixedInline(text: string): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(\$[^$]+\$)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      const inner = part.slice(1, -1);
      return (
        <React.Fragment key={idx}>{renderInlineMath(inner)}</React.Fragment>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}
