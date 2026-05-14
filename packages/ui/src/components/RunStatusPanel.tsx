"use client";

import * as React from "react";
import { Search, ArrowDownToLine, ArrowDown, Copy, Filter } from "lucide-react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";
import { Button } from "./Button.js";
import type { StatusKey } from "../tokens.js";

/**
 * RunStatusPanel — visualizes runner output and run status.
 *
 * Behaviors implemented (backlog/09 Component Behaviors):
 *  - Scroll-to-tail toggle (auto-follow latest line).
 *  - In-panel search (substring match, highlight count).
 *  - Severity filter (info/warn/error).
 *  - Copy-with-timestamp (single line or all visible).
 *  - Minimal ANSI renderer for SGR color codes (no innerHTML).
 *  - Visually distinguishes execution status (timeout/OOM/crash/exit_nonzero
 *    vs. ok); execution failures are NOT collapsed into grade failures.
 */

export type LogSeverity = "info" | "warn" | "error";

export interface RunLogLine {
  /** ISO timestamp or epoch ms — caller's choice. Used in copy-with-timestamp. */
  ts: string | number;
  severity: LogSeverity;
  /** Raw text. May contain ANSI SGR codes (\x1b[...m). */
  text: string;
}

export type RunExecutionStatus =
  | "ok"
  | "timeout"
  | "oom"
  | "crash"
  | "exit_nonzero";

export interface RunStatusPanelProps {
  /**
   * Log lines to render. Optional so the panel can be mounted as a self-
   * fetching widget when only `stageRef` is supplied.
   */
  lines?: ReadonlyArray<RunLogLine>;
  executionStatus?: RunExecutionStatus;
  /** Optional overall run status, e.g. when grade has been assigned. */
  runStatus?: StatusKey;
  className?: string;
  /** Initial scroll-to-tail state. */
  initialScrollToTail?: boolean;
  /**
   * Stage ref the panel should fetch logs for when no explicit `lines` are
   * provided. Self-fetching variant.
   *
   * TODO: wire to API.
   */
  stageRef?: string;
}

const SEVERITY_CLASS: Record<LogSeverity, string> = {
  info: "text-(--color-rc-text)",
  warn: "text-(--color-rc-warning)",
  error: "text-(--color-rc-danger)",
};

const EXECUTION_BADGE: Record<RunExecutionStatus, StatusKey | null> = {
  ok: null,
  timeout: "timeout",
  oom: "oom",
  crash: "crash",
  exit_nonzero: "exit_nonzero",
};

/**
 * Minimal ANSI SGR parser — supports the common color codes (30-37, 90-97,
 * 40-47, 100-107) plus bold (1) and reset (0). Returns React spans rather
 * than HTML strings to avoid XSS surface.
 */
const ANSI_FG: Record<number, string> = {
  30: "var(--color-rc-text-subtle)",
  31: "var(--color-rc-danger)",
  32: "var(--color-rc-success)",
  33: "var(--color-rc-warning)",
  34: "var(--color-rc-info)",
  35: "var(--color-rc-accent)",
  36: "var(--color-rc-info)",
  37: "var(--color-rc-text)",
  90: "var(--color-rc-text-subtle)",
  91: "var(--color-rc-danger)",
  92: "var(--color-rc-success)",
  93: "var(--color-rc-warning)",
  94: "var(--color-rc-info)",
  95: "var(--color-rc-accent)",
  96: "var(--color-rc-info)",
  97: "var(--color-rc-text)",
};

interface AnsiSegment {
  text: string;
  color?: string | undefined;
  bold?: boolean | undefined;
}

function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const re = /\x1b\[([0-9;]*)m/g;
  let cursor = 0;
  let color: string | undefined;
  let bold = false;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    if (match.index > cursor) {
      const seg: AnsiSegment = {
        text: input.slice(cursor, match.index),
      };
      if (color !== undefined) seg.color = color;
      if (bold) seg.bold = true;
      segments.push(seg);
    }
    const params = (match[1] ?? "").split(";").filter(Boolean).map(Number);
    if (params.length === 0) {
      color = undefined;
      bold = false;
    } else {
      for (const p of params) {
        if (p === 0) {
          color = undefined;
          bold = false;
        } else if (p === 1) {
          bold = true;
        } else if (p === 22) {
          bold = false;
        } else if (p === 39) {
          color = undefined;
        } else if (ANSI_FG[p] !== undefined) {
          color = ANSI_FG[p];
        }
      }
    }
    cursor = re.lastIndex;
  }
  if (cursor < input.length) {
    const seg: AnsiSegment = { text: input.slice(cursor) };
    if (color !== undefined) seg.color = color;
    if (bold) seg.bold = true;
    segments.push(seg);
  }
  return segments;
}

function formatTimestamp(ts: string | number): string {
  if (typeof ts === "number") {
    try {
      return new Date(ts).toISOString();
    } catch {
      return String(ts);
    }
  }
  return ts;
}

export function RunStatusPanel({
  lines,
  executionStatus = "ok",
  runStatus,
  className,
  initialScrollToTail = true,
}: RunStatusPanelProps) {
  const [scrollToTail, setScrollToTail] = React.useState(initialScrollToTail);
  const [query, setQuery] = React.useState("");
  const [severities, setSeverities] = React.useState<Set<LogSeverity>>(
    () => new Set<LogSeverity>(["info", "warn", "error"]),
  );
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const sourceLines = lines ?? [];

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceLines.filter(
      (l) =>
        severities.has(l.severity) &&
        (q === "" || l.text.toLowerCase().includes(q)),
    );
  }, [sourceLines, query, severities]);

  React.useEffect(() => {
    if (scrollToTail && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered, scrollToTail]);

  const toggleSeverity = (sev: LogSeverity) => {
    setSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(sev)) {
        next.delete(sev);
      } else {
        next.add(sev);
      }
      // Never empty — if user disables all, restore all.
      if (next.size === 0) {
        next.add("info");
        next.add("warn");
        next.add("error");
      }
      return next;
    });
  };

  const copyAllVisible = async () => {
    const text = filtered
      .map((l) => `[${formatTimestamp(l.ts)}] [${l.severity}] ${l.text}`)
      .join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* noop */
      }
    }
  };

  const copyLine = async (line: RunLogLine) => {
    const text = `[${formatTimestamp(line.ts)}] [${line.severity}] ${line.text}`;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        /* noop */
      }
    }
  };

  const execBadge = EXECUTION_BADGE[executionStatus];

  return (
    <section
      aria-label="Run status"
      className={cn(
        "flex h-full min-h-0 flex-col rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg)",
        className,
      )}
    >
      {/* Toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-(--color-rc-border) px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {execBadge ? (
            <StatusBadge status={execBadge} size="sm" />
          ) : (
            <StatusBadge status={runStatus ?? "in_progress"} size="sm" />
          )}
        </div>

        <label className="ml-auto inline-flex items-center gap-1 rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-2 h-7 text-(--text-rc-sm)">
          <Search size={12} aria-hidden />
          <input
            type="search"
            placeholder="Search logs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent outline-none w-32 placeholder:text-(--color-rc-text-subtle)"
            aria-label="Search log lines"
          />
        </label>

        <div
          className="inline-flex items-center gap-0.5"
          role="group"
          aria-label="Severity filter"
        >
          <Filter
            size={12}
            aria-hidden
            className="text-(--color-rc-text-muted) mr-1"
          />
          {(["info", "warn", "error"] as LogSeverity[]).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => toggleSeverity(sev)}
              aria-pressed={severities.has(sev)}
              className={cn(
                "rounded-(--radius-rc-sm) px-1.5 h-7 text-(--text-rc-xs) capitalize",
                severities.has(sev)
                  ? "bg-(--color-rc-surface) text-(--color-rc-text)"
                  : "text-(--color-rc-text-subtle)",
              )}
            >
              {sev}
            </button>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setScrollToTail((v) => !v)}
          aria-pressed={scrollToTail}
          leadingIcon={
            scrollToTail ? <ArrowDownToLine size={14} /> : <ArrowDown size={14} />
          }
        >
          {scrollToTail ? "Following" : "Follow tail"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void copyAllVisible();
          }}
          leadingIcon={<Copy size={14} />}
        >
          Copy
        </Button>
      </header>

      {/* Log body */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto p-2 font-(--font-rc-mono) text-(--text-rc-xs) leading-snug"
      >
        {filtered.length === 0 ? (
          <p className="text-(--color-rc-text-muted)">No log lines.</p>
        ) : (
          <ul>
            {filtered.map((line, i) => {
              const segs = parseAnsi(line.text);
              return (
                <li
                  key={i}
                  className={cn(
                    "group flex gap-2 whitespace-pre-wrap py-0.5",
                    SEVERITY_CLASS[line.severity],
                  )}
                >
                  <span
                    aria-hidden
                    className="flex-none select-none text-(--color-rc-text-subtle)"
                  >
                    {formatTimestamp(line.ts)}
                  </span>
                  <span className="flex-1">
                    {segs.map((s, j) => (
                      <span
                        key={j}
                        style={{
                          ...(s.color !== undefined ? { color: s.color } : {}),
                          ...(s.bold ? { fontWeight: 600 } : {}),
                        }}
                      >
                        {s.text}
                      </span>
                    ))}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void copyLine(line);
                    }}
                    aria-label="Copy line with timestamp"
                    className="flex-none opacity-0 group-hover:opacity-100 text-(--color-rc-text-subtle) hover:text-(--color-rc-text)"
                  >
                    <Copy size={12} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
