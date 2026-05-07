"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../lib/cn.js";
import { Button } from "./Button.js";

/**
 * CommandBlock — render a list of CLI commands with copy-to-clipboard.
 *
 * Stage authors MUST source command strings from `@researchcrafters/ui/cli-commands`
 * rather than typing them inline (per `TODOS/09` CLI Surface Sync).
 */
export interface CommandBlockProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  commands: string[];
  /** Optional caption shown above the block. */
  caption?: string;
  /** Optional shell prompt prefix shown before each command. */
  promptSymbol?: string;
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

export const CommandBlock = React.forwardRef<HTMLDivElement, CommandBlockProps>(
  function CommandBlock(
    { commands, caption, promptSymbol = "$", className, ...rest },
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
          "rounded-[--radius-rc-md] border border-[--color-rc-border] bg-[--color-rc-surface]",
          className,
        )}
        {...rest}
      >
        {caption ? (
          <div className="flex items-center justify-between border-b border-[--color-rc-border] px-3 py-2 text-[--text-rc-sm] text-[--color-rc-text-muted]">
            <span>{caption}</span>
          </div>
        ) : null}
        <div className="flex items-start justify-between gap-2 p-3">
          <pre className="font-[--font-rc-mono] text-[--text-rc-sm] leading-snug whitespace-pre-wrap m-0">
            {commands.map((cmd, i) => (
              <div key={i} className="flex">
                <span
                  aria-hidden
                  className="text-[--color-rc-text-subtle] select-none mr-2"
                >
                  {promptSymbol}
                </span>
                <code className="text-[--color-rc-text]">{cmd}</code>
              </div>
            ))}
          </pre>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              void handleCopy();
            }}
            aria-label={copied ? "Copied" : "Copy commands"}
            leadingIcon={
              copied ? <Check size={14} /> : <Copy size={14} />
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    );
  },
);
