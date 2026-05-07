import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "../lib/cn.js";

/**
 * Prose — render a markdown string with bold / italic / lists / inline code /
 * inline + block math (KaTeX) / GFM tables. The single component used wherever
 * authored prose surfaces in the product (decision prompts, failed-branch
 * lessons, paper notes, evidence captions, etc.).
 *
 * Math syntax: `$inline$` and `$$block$$` (LaTeX delimiters via remark-math).
 * Inline code via single backticks renders as monospace chips.
 *
 * The wrapper class `prose-rc` (defined in `packages/ui/src/styles.css`)
 * controls typography (line-height 1.6, accent-coloured links, code chip
 * background). Pass `className` to override the wrapper for special surfaces.
 *
 * The underlying `react-markdown` is sanitized by default — raw HTML in the
 * input is NOT rendered, so user-authored content never escapes into the DOM.
 */
export interface ProseProps {
  /** Markdown source. */
  children: string;
  /** Visual size — `sm` is for tight cards / right-rail, `md` is the default
   *  body, `lg` is for first-fold copy. */
  size?: "sm" | "md" | "lg";
  /** Render as a single inline fragment (no block wrapper, no `<p>` margins).
   *  Use when embedding short markdown inside a sentence-level container —
   *  branch summaries, graph node titles, status pills, decision choice
   *  labels. The wrapper is a `<span>` and `p` tags collapse to fragments so
   *  the markdown appears as if it were written directly into the parent. */
  inline?: boolean;
  /** Override the wrapper class entirely. */
  className?: string;
}

export function Prose({
  children,
  size = "md",
  inline = false,
  className,
}: ProseProps): React.ReactElement {
  if (inline) {
    return (
      <span
        data-rc-prose-inline
        className={cn("prose-rc-inline", className)}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            // Collapse the auto-wrapping <p> so inline markdown sits flush
            // with surrounding sentence-level content.
            p: ({ children: kids }) => <>{kids}</>,
          }}
        >
          {children}
        </ReactMarkdown>
      </span>
    );
  }
  return (
    <div
      data-rc-prose
      className={cn(
        "prose-rc",
        size === "sm" && "prose-rc-sm",
        size === "lg" && "prose-rc-lg",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
