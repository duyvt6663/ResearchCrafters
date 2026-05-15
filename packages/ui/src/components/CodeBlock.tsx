import * as React from "react";
import { Code2, Sparkles, Terminal } from "lucide-react";
import { cn } from "../lib/cn.js";
import { getLangChipLabel, getLangColor } from "../tokens.js";

/**
 * CodeBlock — server-rendered syntax-highlighted code sample.
 *
 * Distinct from `CommandBlock` (which is the terminal/CLI surface). Used on
 * marketing pages to show inline code snippets — e.g. "here's a taste of the
 * canonical solution" on the package overview.
 *
 * Visual chrome (2026-05-08 iteration):
 *  - Top bar (always rendered): a lang chip on the left (mono uppercase 11px,
 *    bg = lang color at 12% alpha, text = lang color), an optional filename
 *    next to it, a green lucide flourish (`Code2` / `Terminal` / `Sparkles`)
 *    to break the monotony of the dark code surface, and a copy button on
 *    the right.
 *  - Left edge stripe: a 3px-wide strip in the lang color so different code
 *    blocks visually differentiate even when stacked back-to-back.
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
 * Languages we lazily preload at boot. The Shiki bundle is ~big per-language
 * so we only register the surface we actually use across stages.
 */
const SUPPORTED_LANGS = [
  "python",
  "typescript",
  "javascript",
  "bash",
  "shell",
  "rust",
  "go",
  "markdown",
  "yaml",
  "sql",
  "json",
] as const;

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
  getLoadedLanguages?: () => string[];
};
let highlighterPromise: Promise<ShikiHighlighter> | null = null;

async function getHighlighterCached(): Promise<ShikiHighlighter> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      // Dynamic import — Next.js code-splits Shiki out of routes that don't
      // render code automatically. Shiki v1.x renamed `getHighlighter` to
      // `createHighlighter`; we tolerate either so a future major bump that
      // restores the old name doesn't break the call site silently.
      const mod = (await import("shiki")) as unknown as {
        createHighlighter?: (options: {
          themes: string[];
          langs: string[];
        }) => Promise<ShikiHighlighter>;
        getHighlighter?: (options: {
          themes: string[];
          langs: string[];
        }) => Promise<ShikiHighlighter>;
      };
      const factory = mod.createHighlighter ?? mod.getHighlighter;
      if (!factory) {
        throw new Error(
          "shiki: neither createHighlighter nor getHighlighter is exported",
        );
      }
      return factory({
        themes: ["github-dark-default", "github-light-default"],
        langs: [...SUPPORTED_LANGS],
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
    // If the lang isn't loaded, gracefully fall back to plain text. We don't
    // want a typo or an unsupported lang to crash a page render.
    let resolvedLang = lang;
    try {
      const loaded: ReadonlyArray<string> =
        hl.getLoadedLanguages?.() ?? [...SUPPORTED_LANGS];
      if (!loaded.includes(lang)) {
        resolvedLang = "text";
      }
    } catch {
      // ignore — we'll just try with the requested lang
    }
    return {
      light: hl.codeToHtml(code, {
        lang: resolvedLang,
        theme: "github-light-default",
      }),
      dark: hl.codeToHtml(code, {
        lang: resolvedLang,
        theme: "github-dark-default",
      }),
    };
  } catch (err) {
    // Don't crash the page if Shiki can't load (missing dep, grammar load
    // failure). Log so devs see the regression instead of silently shipping
    // plain code. Visible in server logs only — this branch is server-only.
    console.warn(
      "[CodeBlock] Shiki rendering failed, falling back to plain text:",
      err instanceof Error ? err.message : err,
    );
    return {
      light: fallbackHtml(code, "github-light-default"),
      dark: fallbackHtml(code, "github-dark-default"),
    };
  }
}

/**
 * Pick the lucide flourish icon for the lang. `bash`/`shell` get `Terminal`,
 * markdown/yaml/json get `Sparkles` (data-y), everything else gets `Code2`.
 * The icon is purely decorative — paired with the lang chip's text label so
 * we never rely on icon-shape alone for language identification.
 */
function pickFlourishIcon(
  lang: string,
): React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }> {
  const key = lang.toLowerCase();
  if (key === "bash" || key === "shell" || key === "sh") return Terminal;
  if (key === "markdown" || key === "md" || key === "yaml" || key === "yml" || key === "json")
    return Sparkles;
  return Code2;
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

  const langColor = getLangColor(lang);
  const chipLabel = getLangChipLabel(lang);
  const FlourishIcon = pickFlourishIcon(lang);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-(--radius-rc-lg) border border-(--color-rc-border)",
        "bg-(--color-rc-code-bg) text-(--color-rc-code-text)",
        className,
      )}
      data-rc-codeblock
      data-lang={lang}
      data-lang-color={langColor}
    >
      {/*
       * Left edge stripe — 3px tall the entire height of the card. Tinted by
       * the lang color so a stack of CodeBlocks reads like a left-margin
       * sequence diagram. We use an absolutely-positioned div instead of a
       * border-left so it stays edge-to-edge even when the card has rounded
       * corners.
       */}
      <div
        aria-hidden
        data-rc-codeblock-stripe
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: langColor }}
      />
      {/*
       * Top bar. Always rendered (even without a filename) so the lang chip
       * + flourish icon always have a home.
       */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 border-b border-white/10 pl-5 pr-3 py-2",
        )}
        data-rc-codeblock-bar
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            data-rc-codeblock-chip
            className={cn(
              "inline-flex items-center rounded-(--radius-rc-sm) px-1.5 py-0.5",
              "font-(--font-rc-mono) text-[11px] uppercase tracking-[0.08em] leading-none",
            )}
            style={{
              background: `color-mix(in srgb, ${langColor} 18%, transparent)`,
              color: langColor,
            }}
          >
            {chipLabel}
          </span>
          <FlourishIcon
            size={14}
            aria-hidden
            className="text-(--color-rc-icon-accent) flex-none"
          />
          {filename ? (
            <span className="font-(--font-rc-mono) text-[11px] text-(--color-rc-code-muted) truncate">
              {filename}
            </span>
          ) : null}
        </div>
        <span className="font-(--font-rc-mono) text-[10px] uppercase tracking-[0.1em] text-(--color-rc-code-muted) flex-none">
          {lang}
        </span>
      </div>
      <div className="relative flex">
        {showLineNumbers ? (
          <div
            aria-hidden
            className={cn(
              "select-none border-r border-white/5 bg-black/10 px-3 py-3 text-right",
              "font-(--font-rc-mono) text-(--text-rc-xs) leading-[1.65] text-(--color-rc-code-muted)",
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
