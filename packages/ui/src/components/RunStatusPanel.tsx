"use client";

import * as React from "react";
import { Search, ArrowDownToLine, ArrowDown, Copy, Filter } from "lucide-react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";
import { Button } from "./Button.js";
import { executionFailure } from "../copy/execution-failure.js";
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
 *  - Execution-failure banner renders authored copy + retry hint when
 *    executionStatus is a failure kind (backlog/00 roadmap line 67 —
 *    "run logs and execution failure handling").
 *  - Self-fetches `/api/runs/{runId}` + `/api/runs/{runId}/logs` on a 1.5s
 *    poll cadence when `runId` is supplied, stopping once the run reaches
 *    a terminal status.
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
   * Log lines to render. Optional so the panel can render a self-fetching
   * widget when `runId` is supplied.
   */
  lines?: ReadonlyArray<RunLogLine>;
  executionStatus?: RunExecutionStatus;
  /** Optional overall run status, e.g. when grade has been assigned. */
  runStatus?: StatusKey;
  className?: string;
  /** Initial scroll-to-tail state. */
  initialScrollToTail?: boolean;
  /**
   * Stage ref. Unused by the panel itself today — kept for callers that pass
   * it for telemetry/data-key purposes; safe to omit when `runId` is set.
   */
  stageRef?: string;
  /**
   * When supplied, the panel polls `/api/runs/{runId}` and
   * `/api/runs/{runId}/logs` to render live status + log lines. Polling
   * stops once the run reaches a terminal status. Any `lines` /
   * `executionStatus` / `runStatus` props provided alongside `runId` act as
   * seeds for the initial render.
   */
  runId?: string;
  /**
   * Polling cadence in milliseconds. Defaults to 1500 ms. Set to 0 to
   * disable polling (single fetch on first render).
   */
  pollIntervalMs?: number;
  /**
   * Override the fetch implementation. Defaults to global `fetch`. Tests
   * inject a stub.
   */
  fetchImpl?: typeof fetch;
}

const TERMINAL_RUN_STATUSES = new Set<string>([
  "ok",
  "timeout",
  "oom",
  "crash",
  "exit_nonzero",
]);


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
  executionStatus,
  runStatus,
  className,
  initialScrollToTail = true,
  runId,
  pollIntervalMs = 1500,
  fetchImpl,
}: RunStatusPanelProps) {
  const [scrollToTail, setScrollToTail] = React.useState(initialScrollToTail);
  const [query, setQuery] = React.useState("");
  const [severities, setSeverities] = React.useState<Set<LogSeverity>>(
    () => new Set<LogSeverity>(["info", "warn", "error"]),
  );
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // Live state populated from `/api/runs/{runId}*` when `runId` is set.
  // Otherwise these stay null and the props are the source of truth.
  const [fetchedLines, setFetchedLines] = React.useState<RunLogLine[] | null>(
    null,
  );
  const [fetchedExecStatus, setFetchedExecStatus] =
    React.useState<RunExecutionStatus | null>(null);
  const [fetchedRunStatus, setFetchedRunStatus] = React.useState<string | null>(
    null,
  );
  const [fetchError, setFetchError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!runId) return undefined;
    const doFetch = fetchImpl ?? (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick(): Promise<void> {
      try {
        const [statusRes, logsRes] = await Promise.all([
          (doFetch as typeof fetch)(`/api/runs/${runId}`, {
            credentials: "include",
          }),
          (doFetch as typeof fetch)(`/api/runs/${runId}/logs`, {
            credentials: "include",
          }),
        ]);

        if (cancelled) return;

        let nextRunStatus: string | null = null;
        let nextExecStatus: RunExecutionStatus | null = null;
        if (statusRes.ok) {
          const body = (await statusRes.json()) as {
            status?: string;
            executionStatus?: string;
          };
          if (typeof body.status === "string") nextRunStatus = body.status;
          if (
            body.executionStatus === "ok" ||
            body.executionStatus === "timeout" ||
            body.executionStatus === "oom" ||
            body.executionStatus === "crash" ||
            body.executionStatus === "exit_nonzero"
          ) {
            nextExecStatus = body.executionStatus;
          }
        } else if (statusRes.status >= 500) {
          setFetchError(`status ${statusRes.status}`);
        }

        let nextLines: RunLogLine[] | null = null;
        if (logsRes.ok) {
          const body = (await logsRes.json()) as {
            lines?: ReadonlyArray<{
              ts?: string;
              severity?: string;
              text?: string;
            }>;
          };
          if (Array.isArray(body.lines)) {
            nextLines = body.lines.flatMap((l) => {
              if (
                typeof l?.ts !== "string" ||
                typeof l?.text !== "string"
              ) {
                return [];
              }
              const sev: LogSeverity =
                l.severity === "warn" ||
                l.severity === "error" ||
                l.severity === "debug"
                  ? l.severity === "debug"
                    ? "info"
                    : l.severity
                  : "info";
              return [{ ts: l.ts, severity: sev, text: l.text }];
            });
          }
        }

        if (cancelled) return;
        if (nextRunStatus !== null) setFetchedRunStatus(nextRunStatus);
        if (nextExecStatus !== null) setFetchedExecStatus(nextExecStatus);
        if (nextLines !== null) setFetchedLines(nextLines);
        if (statusRes.ok && logsRes.ok) setFetchError(null);

        const terminal =
          nextRunStatus !== null && TERMINAL_RUN_STATUSES.has(nextRunStatus);
        if (!terminal && pollIntervalMs > 0) {
          timer = setTimeout(() => {
            void tick();
          }, pollIntervalMs);
        }
      } catch (err) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : "fetch_failed");
        if (pollIntervalMs > 0) {
          timer = setTimeout(() => {
            void tick();
          }, pollIntervalMs);
        }
      }
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId, pollIntervalMs, fetchImpl]);

  const effectiveExecutionStatus: RunExecutionStatus =
    fetchedExecStatus ?? executionStatus ?? "ok";
  const sourceLines: ReadonlyArray<RunLogLine> = fetchedLines ?? lines ?? [];

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

  const execBadge = EXECUTION_BADGE[effectiveExecutionStatus];
  const failureCopy =
    effectiveExecutionStatus === "timeout" ||
    effectiveExecutionStatus === "oom" ||
    effectiveExecutionStatus === "crash" ||
    effectiveExecutionStatus === "exit_nonzero"
      ? executionFailure(effectiveExecutionStatus)
      : null;
  const fetchedRunBadge: StatusKey | null = (() => {
    if (!fetchedRunStatus) return null;
    if (fetchedRunStatus === "queued") return "in_progress";
    if (fetchedRunStatus === "running") return "in_progress";
    if (fetchedRunStatus === "ok") return "pass";
    if (fetchedRunStatus === "timeout") return "timeout";
    if (fetchedRunStatus === "oom") return "oom";
    if (fetchedRunStatus === "crash") return "crash";
    if (fetchedRunStatus === "exit_nonzero") return "exit_nonzero";
    return null;
  })();

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
            <StatusBadge
              status={runStatus ?? fetchedRunBadge ?? "in_progress"}
              size="sm"
            />
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

      {failureCopy ? (
        <div
          role="alert"
          aria-label="Execution failure"
          data-testid="execution-failure-banner"
          data-execution-status={effectiveExecutionStatus}
          className="border-b border-(--color-rc-border) bg-(--color-rc-surface-muted) px-3 py-2 text-(--text-rc-sm)"
        >
          <p className="font-semibold text-(--color-rc-danger)">
            {failureCopy.title}
          </p>
          <p className="text-(--color-rc-text-muted)">{failureCopy.body}</p>
          <p className="text-(--color-rc-text-subtle)">
            {failureCopy.retryHint}
          </p>
        </div>
      ) : null}
      {fetchError ? (
        <div
          role="status"
          aria-label="Log fetch error"
          data-testid="log-fetch-error"
          className="border-b border-(--color-rc-border) bg-(--color-rc-surface-muted) px-3 py-1 text-(--text-rc-xs) text-(--color-rc-warning)"
        >
          Live log stream interrupted ({fetchError}). Retrying…
        </div>
      ) : null}

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
