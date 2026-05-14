"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../lib/cn.js";

/**
 * CommandBlock — terminal emulator for CLI commands.
 *
 * Visual contract: this is the brand surface (CodeCrafters-style). A 28px
 * window-chrome bar with three traffic-light dots and an optional title path,
 * a copy button on the right of the chrome, then a stack of `$`-prefixed
 * commands. Multi-line commands continue with `>` prompts. Output lines are
 * tinted by tone and rendered without a `$` prefix.
 *
 * Anti-patterns:
 *  - Stage authors MUST source command strings from
 *    `@researchcrafters/ui/cli-commands` rather than typing them inline (per
 *    `backlog/09` CLI Surface Sync).
 *  - Workbench surfaces (stage player) must keep `typing` off — the typing
 *    animation is for marketing/hero surfaces only.
 */
export interface CommandBlockOutput {
  line: string;
  tone?: "success" | "warning" | "danger" | "muted";
}

export interface CommandBlockProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  commands: string[];
  /** Optional caption shown above the block (legacy — prefer `title`). */
  caption?: string;
  /** Optional path/context shown in the title bar (mono, dimmed). */
  title?: string;
  /** Optional shell prompt prefix shown before each command. */
  promptSymbol?: string;
  /**
   * Optional output lines rendered after the commands. Tone tints text via
   * the success / warning / danger semantic tokens; default is `muted`.
   */
  output?: ReadonlyArray<CommandBlockOutput>;
  /**
   * When true, animate the first command character-by-character on mount with
   * a blinking caret. CSS-only; short-circuits to instant render under
   * `prefers-reduced-motion: reduce`.
   */
  typing?: boolean;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

const TONE_CLASSES: Record<NonNullable<CommandBlockOutput["tone"]>, string> = {
  success: "text-(--color-rc-success)",
  warning: "text-(--color-rc-warning)",
  danger: "text-(--color-rc-danger)",
  muted: "text-(--color-rc-code-muted)",
};

export const CommandBlock = React.forwardRef<HTMLDivElement, CommandBlockProps>(
  function CommandBlock(
    {
      commands,
      caption,
      title,
      promptSymbol = "$",
      output,
      typing = false,
      className,
      ...rest
    },
    ref,
  ) {
    const [copied, setCopied] = React.useState(false);
    const text = commands.join("\n");

    const handleCopy = React.useCallback(async () => {
      const ok = await copyToClipboard(text);
      if (ok) {
        setCopied(true);
        const timer = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(timer);
      }
      return undefined;
    }, [text]);

    return (
      <div
        ref={ref}
        className={cn(
          "overflow-hidden rounded-(--radius-rc-lg) border border-(--color-rc-border-strong)",
          "bg-(--color-rc-code-bg) text-(--color-rc-code-text)",
          "shadow-[0_8px_24px_-12px_rgba(15,20,35,0.45)]",
          className,
        )}
        {...rest}
      >
        {/* Window chrome — 28px tall, traffic lights + optional title + copy. */}
        <div
          className={cn(
            "flex h-7 items-center justify-between gap-3 border-b border-black/40 px-3",
            "bg-(--color-rc-code-bg)",
          )}
        >
          <div className="flex items-center gap-1.5" aria-hidden>
            <span
              className="block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#FF5F57" }}
            />
            <span
              className="block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#FEBC2E" }}
            />
            <span
              className="block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: "#28C840" }}
            />
          </div>
          {title ? (
            <span
              className={cn(
                "truncate text-[11px] font-(--font-rc-mono)",
                "text-(--color-rc-code-muted)",
              )}
            >
              {title}
            </span>
          ) : (
            <span className="text-[11px] font-(--font-rc-mono) text-(--color-rc-code-muted)">
              {caption ?? ""}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            aria-label={copied ? "Copied" : "Copy commands"}
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-(--radius-rc-sm)",
              "text-(--color-rc-code-muted) transition-colors duration-(--duration-rc-fast)",
              "hover:bg-white/5 hover:text-(--color-rc-code-text)",
            )}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        {/* Body — commands then output. */}
        <pre
          className={cn(
            "m-0 overflow-x-auto px-4 py-3 font-(--font-rc-mono) text-(--text-rc-sm)",
            "leading-[1.65] whitespace-pre-wrap",
          )}
        >
          {commands.map((cmd, i) => {
            const linesInCmd = cmd.split("\n");
            return (
              <div key={i} className="flex flex-col">
                {linesInCmd.map((ln, j) => (
                  <div key={j} className="flex items-baseline">
                    <span
                      aria-hidden
                      className="mr-2 select-none text-(--color-rc-accent)"
                    >
                      {j === 0 ? promptSymbol : ">"}
                    </span>
                    {typing && i === 0 && j === 0 ? (
                      <TypingLine text={ln} />
                    ) : (
                      <code className="text-(--color-rc-code-text)">{ln}</code>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {output && output.length > 0
            ? output.map((line, i) => (
                <div
                  key={`out-${i}`}
                  className={cn(
                    "flex items-baseline",
                    TONE_CLASSES[line.tone ?? "muted"],
                  )}
                >
                  <span aria-hidden className="mr-2 w-3 select-none" />
                  <code>{line.line}</code>
                </div>
              ))
            : null}
        </pre>
      </div>
    );
  },
);

/**
 * Internal — single-line typing animation. CSS-only: width animates from 0 to
 * the natural width using a steps() timing function so each character lands
 * on a frame boundary. The blinking caret follows the visible end. Under
 * `prefers-reduced-motion: reduce` the @keyframes are not defined, so the
 * line renders instantly with no caret animation.
 */
function TypingLine({ text }: { text: string }) {
  const charCount = Math.max(1, text.length);
  return (
    <span className="relative inline-flex items-center">
      <code
        className="overflow-hidden whitespace-pre text-(--color-rc-code-text)"
        style={{
          display: "inline-block",
          animation: `rc-typing ${Math.min(2400, 60 * charCount)}ms steps(${charCount}, end) 200ms 1 both`,
          width: "0ch",
          // Set the final width via CSS var so the keyframes can reference it.
          ["--rc-typing-width" as string]: `${charCount}ch`,
        }}
      >
        {text}
      </code>
      <span
        aria-hidden
        className="ml-0.5 inline-block h-[1.1em] w-[2px] bg-(--color-rc-accent)"
        style={{ animation: "rc-blink 1s steps(2, start) infinite" }}
      />
    </span>
  );
}
