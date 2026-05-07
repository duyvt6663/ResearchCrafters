import * as React from "react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";
import type { StatusKey } from "../tokens.js";

/**
 * GradePanel — overall status, rubric breakdown, evidence refs, next action.
 *
 * Per `docs/FRONTEND.md` section 11. Execution failure must NOT be collapsed
 * into research failure — `RunStatusPanel` handles execution status; this
 * panel only renders grades produced after `execution_status=ok`.
 */
export interface GradeRubricDimension {
  id: string;
  name: string;
  /** Score in [0, 1]. */
  score: number;
  comment?: string;
}

export interface GradeEvidenceRef {
  id: string;
  label: string;
  href?: string;
}

export interface GradePanelProps {
  status: Extract<StatusKey, "pass" | "partial" | "fail" | "retry">;
  /** Optional overall percentage 0-100. */
  overallScore?: number;
  rubric: GradeRubricDimension[];
  evidence: GradeEvidenceRef[];
  strengths?: string[];
  revisionPoints?: string[];
  nextAction?: React.ReactNode;
  className?: string;
}

function formatPct(n: number): string {
  return `${Math.round(Math.max(0, Math.min(100, n)))}%`;
}

export function GradePanel({
  status,
  overallScore,
  rubric,
  evidence,
  strengths,
  revisionPoints,
  nextAction,
  className,
}: GradePanelProps) {
  return (
    <section
      aria-label="Grade"
      className={cn("flex flex-col gap-3", className)}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {overallScore !== undefined ? (
            <span className="font-(--font-rc-mono) text-(--text-rc-sm) text-(--color-rc-text-muted)">
              {formatPct(overallScore)}
            </span>
          ) : null}
        </div>
        {nextAction ? <div>{nextAction}</div> : null}
      </header>

      <div>
        <h3 className="text-(--text-rc-sm) font-semibold text-(--color-rc-text) mb-1.5">
          Rubric
        </h3>
        <ul className="flex flex-col gap-1.5">
          {rubric.map((d) => (
            <li
              key={d.id}
              className="rounded-(--radius-rc-sm) border border-(--color-rc-border) p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-(--text-rc-sm)">{d.name}</span>
                <span className="font-(--font-rc-mono) text-(--text-rc-sm) text-(--color-rc-text-muted)">
                  {formatPct(d.score * 100)}
                </span>
              </div>
              {d.comment ? (
                <p className="mt-1 text-(--text-rc-xs) text-(--color-rc-text-muted)">
                  {d.comment}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {evidence.length > 0 ? (
        <div>
          <h3 className="text-(--text-rc-sm) font-semibold mb-1.5">
            Evidence cited
          </h3>
          <ul className="flex flex-wrap gap-1">
            {evidence.map((e) => (
              <li key={e.id}>
                {e.href ? (
                  <a
                    href={e.href}
                    className="inline-flex items-center rounded-(--radius-rc-sm) border border-(--color-rc-border) px-1.5 py-0.5 text-(--text-rc-xs) text-(--color-rc-text) hover:bg-(--color-rc-surface-muted)"
                  >
                    {e.label}
                  </a>
                ) : (
                  <span className="inline-flex items-center rounded-(--radius-rc-sm) border border-(--color-rc-border) px-1.5 py-0.5 text-(--text-rc-xs) text-(--color-rc-text)">
                    {e.label}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {strengths && strengths.length > 0 ? (
        <div>
          <h3 className="text-(--text-rc-sm) font-semibold mb-1.5">
            What was strong
          </h3>
          <ul className="list-disc pl-4 text-(--text-rc-sm) text-(--color-rc-text-muted)">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {revisionPoints && revisionPoints.length > 0 ? (
        <div>
          <h3 className="text-(--text-rc-sm) font-semibold mb-1.5">
            What to revise
          </h3>
          <ul className="list-disc pl-4 text-(--text-rc-sm) text-(--color-rc-text-muted)">
            {revisionPoints.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
