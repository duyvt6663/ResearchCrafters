import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * CodeBlock — server-rendered syntax-highlighted code sample.
 *
 * Distinct from `CommandBlock` (which is the terminal/CLI surface). Used on
 * marketing pages to show inline code snippets — e.g. "here's a taste of the
 * canonical solution" on the package overview.
 *
 * Uses Shiki for highlighting. Renders BOTH `github-light-default` and
 * `github-dark-default` HTML and swaps via the page's `data-theme` attribute
 * so consumers don't have to wire a separate dark-mode pass.
 *
 * This is a server component: no `"use client"`. Shiki's highlighter is async
 * — the export is an async function. Pages that want to render this must
 * `await` it via React Server Components.
 */
export interface CodeBlockProps {
  /** Source code to highlight. */
  code: string;
  /** Shiki language id. Default `python`. */
  lang?: string;
  /** Filename chip rendered top-right, mono. Optional. */
  filename?: string;
  /** Whether to show line numbers in a thin gutter. Default true. */
  showLineNumbers?: boolean;
  className?: string;
}

/**
 * Lazily resolve the Shiki highlighter. We import dynamically and cache a
 * single instance for the lifetime of the process — Shiki is heavy and we
 * want to avoid loading WASM grammars on every render.
 */
type ShikiHighlighter = {
  codeToHtml: (
    code: string,
    options: { lang: string; theme: string },
  ) => string;
};
let highlighterPromise: Promise<ShikiHighlighter> | null = null;

async function getHighlighterCached(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      // Dynamic import keeps Shiki out of any bundle that doesn't render code.
      // We resolve the specifier through a variable so TypeScript treats the
      // module as `any` — declaring an `@types/shiki` shim across the
      // monorepo just for this call site would be heavier than the dodge.
      const specifier = "shiki";
      const mod = (await import(/* webpackIgnore: true */ specifier)) as {
        getHighlighter: (options: {
          themes: string[];
          langs: string[];
        }) => Promise<ShikiHighlighter>;
      };
      return mod.getHighlighter({
        themes: ["github-dark-default", "github-light-default"],
        langs: ["python", "typescript", "javascript", "bash", "json", "yaml"],
      });
    })();
  }
  return highlighterPromise;
}

/**
 * Fallback renderer used when Shiki is unavailable (e.g. install hasn't run
 * yet, or the lang isn't known). Returns plain HTML wrapped in the same
 * `<pre class="shiki ...">` envelope so visual smoke tests still find the
 * marker selector.
 */
function fallbackHtml(code: string, theme: string): string {
  const escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre class="shiki ${theme}" style="background-color:transparent" tabindex="0"><code>${escaped}</code></pre>`;
}

async function renderShiki(
  code: string,
  lang: string,
): Promise<{ light: string; dark: string }> {
  try {
    const hl = await getHighlighterCached();
    return {
      light: hl.codeToHtml(code, {
        lang,
        theme: "github-light-default",
      }),
      dark: hl.codeToHtml(code, {
        lang,
        theme: "github-dark-default",
      }),
    };
  } catch {
    return {
      light: fallbackHtml(code, "github-light-default"),
      dark: fallbackHtml(code, "github-dark-default"),
    };
  }
}

export async function CodeBlock({
  code,
  lang = "python",
  filename,
  showLineNumbers = true,
  className,
}: CodeBlockProps): Promise<React.ReactElement> {
  const { light, dark } = await renderShiki(code, lang);

  const lineCount = code.split("\n").length;
  const numbers: number[] = [];
  for (let i = 1; i <= lineCount; i++) numbers.push(i);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[--radius-rc-lg] border border-[--color-rc-border]",
        "bg-[--color-rc-code-bg] text-[--color-rc-code-text]",
        className,
      )}
      data-rc-codeblock
      data-lang={lang}
    >
      {filename ? (
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2",
          )}
        >
          <span className="font-[--font-rc-mono] text-[11px] text-[--color-rc-code-muted]">
            {filename}
          </span>
          <span className="font-[--font-rc-mono] text-[10px] uppercase tracking-[0.1em] text-[--color-rc-code-muted]">
            {lang}
          </span>
        </div>
      ) : null}
      <div className="relative flex">
        {showLineNumbers ? (
          <div
            aria-hidden
            className={cn(
              "select-none border-r border-white/5 bg-black/10 px-3 py-3 text-right",
              "font-[--font-rc-mono] text-[--text-rc-xs] leading-[1.65] text-[--color-rc-code-muted]",
            )}
          >
            {numbers.map((n) => (
              <div key={n}>{n}</div>
            ))}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 overflow-x-auto px-4 py-3">
          {/* Light + dark themed Shiki output. The page's data-theme drives
              which one is visible; we mark each with data-theme so CSS can
              hide/show without touching component state. */}
          <div
            data-theme="light"
            data-rc-codeblock-theme="light"
            className="rc-codeblock-shiki rc-codeblock-shiki--light"
            dangerouslySetInnerHTML={{ __html: light }}
          />
          <div
            data-theme="dark"
            data-rc-codeblock-theme="dark"
            className="rc-codeblock-shiki rc-codeblock-shiki--dark"
            dangerouslySetInnerHTML={{ __html: dark }}
          />
        </div>
      </div>
    </div>
  );
}
