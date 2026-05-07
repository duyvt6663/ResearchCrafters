"use client";

import * as React from "react";
import { Lock, Sparkles, Compass, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";

/**
 * Mobile-friendly decision-graph view.
 *
 * Per `docs/FRONTEND.md` §10 + `TODOS/09 Mobile Fallbacks`, the React-Flow
 * pannable canvas does not work on narrow viewports — a vertical timeline
 * is the documented fallback. This component renders the same `nodes`
 * shape the future canvas will consume, but as an indexed step list with:
 *
 *   - status pill (current / completed / locked) per node
 *   - one-line tradeoff summary per branch (no spoilers for hidden ones)
 *   - keyboard-friendly tap targets (`role="link"`)
 *
 * Lock-state semantics: a node is locked if its predecessor isn't completed
 * AND the learner doesn't have entitlement to free-preview it. The caller
 * (web page or package-overview right rail) is responsible for providing
 * `status` on every node — this component does not infer.
 *
 * Spoiler discipline: branches with `revealed: false` render the LABEL only,
 * never the `summary`. This matches the `stage_policy.branch_feedback`
 * semantics enforced server-side, but the component is the second line of
 * defense — even if a misconfigured page passes `revealed: false` alongside
 * a populated `summary`, the summary is suppressed on the wire.
 */

export type DecisionGraphNodeStatus = "current" | "completed" | "locked";

export interface DecisionGraphBranch {
  id: string;
  label: string;
  summary: string;
  type: "canonical" | "suboptimal" | "failed";
  revealed: boolean;
}

export interface DecisionGraphNode {
  ref: string;
  title: string;
  type:
    | "framing"
    | "math"
    | "decision"
    | "implementation"
    | "experiment"
    | "analysis"
    | "writing"
    | "review"
    | "reflection";
  status: DecisionGraphNodeStatus;
  branches?: DecisionGraphBranch[];
  href?: string;
}

export interface DecisionGraphMobileProps {
  nodes: ReadonlyArray<DecisionGraphNode>;
  className?: string;
  /** Emitted when the learner taps a node row. */
  onNodeOpen?: (ref: string) => void;
}

const TYPE_LABEL: Record<DecisionGraphNode["type"], string> = {
  framing: "Frame",
  math: "Math",
  decision: "Decide",
  implementation: "Build",
  experiment: "Run",
  analysis: "Analyse",
  writing: "Write",
  review: "Review",
  reflection: "Reflect",
};

const BRANCH_BADGE: Record<
  DecisionGraphBranch["type"],
  { label: string; className: string }
> = {
  canonical: {
    label: "Canonical",
    className:
      "bg-[--color-rc-success-subtle] text-[--color-rc-success] border-[--color-rc-success]",
  },
  suboptimal: {
    label: "Suboptimal",
    className:
      "bg-[--color-rc-warning-subtle] text-[--color-rc-warning] border-[--color-rc-warning]",
  },
  failed: {
    label: "Failed",
    className:
      "bg-[--color-rc-danger-subtle] text-[--color-rc-danger] border-[--color-rc-danger]",
  },
};

function statusKey(s: DecisionGraphNodeStatus): "in_progress" | "completed" | "locked" {
  if (s === "current") return "in_progress";
  return s;
}

export function DecisionGraphMobile({
  nodes,
  className,
  onNodeOpen,
}: DecisionGraphMobileProps): React.ReactElement {
  return (
    <ol
      aria-label="Decision graph"
      className={cn(
        "relative flex flex-col gap-3 pl-5",
        // The continuous spine on the left ties the steps visually.
        "before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-px before:bg-[--color-rc-border]",
        className,
      )}
    >
      {nodes.map((node, idx) => {
        const isLocked = node.status === "locked";
        return (
          <li
            key={node.ref}
            className={cn(
              "relative",
              isLocked ? "opacity-60" : "",
            )}
          >
            {/* Step dot on the spine */}
            <span
              aria-hidden
              className={cn(
                "absolute -left-[1.0625rem] top-2 inline-flex h-3 w-3 items-center justify-center rounded-full border-2",
                node.status === "completed"
                  ? "border-[--color-rc-success] bg-[--color-rc-success]"
                  : node.status === "current"
                    ? "border-[--color-rc-accent] bg-[--color-rc-bg]"
                    : "border-[--color-rc-border-strong] bg-[--color-rc-bg]",
              )}
            />
            <button
              type="button"
              role={node.href ? "link" : undefined}
              onClick={() => onNodeOpen?.(node.ref)}
              disabled={isLocked && !node.href}
              className={cn(
                "group flex w-full items-start gap-2 rounded-[--radius-rc-md] border border-[--color-rc-border] bg-[--color-rc-bg] p-3 text-left",
                "transition-colors duration-[--duration-rc-fast]",
                "hover:border-[--color-rc-border-strong] focus-visible:outline-none focus-visible:border-[--color-rc-accent]",
                isLocked ? "cursor-not-allowed" : "",
              )}
            >
              <span
                aria-hidden
                className="flex-none rounded-[--radius-rc-sm] border border-[--color-rc-border] bg-[--color-rc-surface] px-1.5 py-0.5 font-[--font-rc-mono] text-[--text-rc-xs] text-[--color-rc-text-muted]"
              >
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-[--font-rc-mono] text-[--text-rc-xs] uppercase tracking-wide text-[--color-rc-text-subtle]">
                    {TYPE_LABEL[node.type]}
                  </span>
                  <StatusBadge status={statusKey(node.status)} size="sm" />
                </span>
                <span className="mt-1 block text-[--text-rc-sm] font-medium text-[--color-rc-text]">
                  {node.title}
                </span>
                {node.branches && node.branches.length > 0 ? (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {node.branches.map((b) => {
                      const visible = b.revealed;
                      const palette = BRANCH_BADGE[b.type];
                      return (
                        <li
                          key={b.id}
                          className="flex items-start gap-2 text-[--text-rc-xs]"
                        >
                          <span
                            className={cn(
                              "mt-0.5 inline-flex flex-none items-center rounded-[--radius-rc-sm] border px-1.5 py-0 leading-snug",
                              visible
                                ? palette.className
                                : "border-dashed border-[--color-rc-border] bg-[--color-rc-surface] text-[--color-rc-text-subtle]",
                            )}
                            aria-label={
                              visible ? palette.label : "Hidden until reveal"
                            }
                          >
                            {visible ? palette.label : "Hidden"}
                          </span>
                          <span
                            className={cn(
                              "min-w-0",
                              visible
                                ? "text-[--color-rc-text]"
                                : "text-[--color-rc-text-subtle]",
                            )}
                          >
                            <span className="block font-medium">{b.label}</span>
                            {visible && b.summary ? (
                              <span className="block text-[--color-rc-text-muted]">
                                {b.summary}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex-none self-center text-[--color-rc-text-subtle]",
                  "transition-transform duration-[--duration-rc-fast] group-hover:translate-x-0.5",
                )}
              >
                {isLocked ? <Lock size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
          </li>
        );
      })}
      {nodes.length === 0 ? (
        <li className="flex items-center gap-2 rounded-[--radius-rc-md] border border-dashed border-[--color-rc-border] bg-[--color-rc-surface] p-3 text-[--text-rc-sm] text-[--color-rc-text-muted]">
          <Compass size={14} aria-hidden />
          No decisions in this package yet.
        </li>
      ) : null}
      {/* End-of-graph marker so the spine ends in something instead of the void */}
      {nodes.length > 0 ? (
        <li
          aria-hidden
          className="ml-1 mt-1 inline-flex items-center gap-2 text-[--text-rc-xs] text-[--color-rc-text-subtle]"
        >
          <Sparkles size={12} />
          End of journey
        </li>
      ) : null}
    </ol>
  );
}
