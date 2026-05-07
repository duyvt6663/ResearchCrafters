import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * RubricPanel — preview of the rubric dimensions for the active stage,
 * surfaced before submit. After grading, use `GradePanel` instead — this
 * panel does not display scores.
 */
export interface RubricDimension {
  id: string;
  /**
   * Display name. Optional because the web app passes rubric rows keyed
   * with `label` (data-layer shape); we fall back to that when set.
   */
  name?: string;
  /** Alias accepted from the data layer in lieu of `name`. */
  label?: string;
  weight?: number;
  description?: string;
}

export interface RubricPanelProps {
  /** Canonical prop. Used when supplied. */
  dimensions?: ReadonlyArray<RubricDimension>;
  /**
   * Alias for `dimensions` accepted by the web app. When both are supplied,
   * `dimensions` wins (so the spec-shaped name remains canonical).
   */
  rubric?: ReadonlyArray<RubricDimension>;
  className?: string;
}

export function RubricPanel({
  dimensions,
  rubric,
  className,
}: RubricPanelProps) {
  const rows = dimensions ?? rubric ?? [];
  const totalWeight = rows.reduce((sum, d) => sum + (d.weight ?? 0), 0);
  return (
    <section
      aria-label="Rubric"
      className={cn("flex flex-col gap-2", className)}
    >
      <h3 className="text-[--text-rc-sm] font-semibold">How this is graded</h3>
      <ul className="flex flex-col gap-1.5">
        {rows.map((d) => (
          <li
            key={d.id}
            className="rounded-[--radius-rc-sm] border border-[--color-rc-border] p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[--text-rc-sm] font-medium">
                {d.name ?? d.label ?? d.id}
              </span>
              {d.weight !== undefined && totalWeight > 0 ? (
                <span className="font-[--font-rc-mono] text-[--text-rc-xs] text-[--color-rc-text-muted]">
                  {Math.round((d.weight / totalWeight) * 100)}%
                </span>
              ) : null}
            </div>
            {d.description ? (
              <p className="mt-1 text-[--text-rc-xs] text-[--color-rc-text-muted]">
                {d.description}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
