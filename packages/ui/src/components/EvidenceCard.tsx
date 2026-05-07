import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * EvidenceCard — server-rendered rich-media surface for the package overview.
 *
 * Replaces the previous flat dotted placeholder with a real visual: an inline
 * SVG training-curve chart, a tight metric table, or a labelled figure
 * placeholder. All three modes use only inline SVG — no asset fetches, no
 * external libraries — so they render server-side without hydration cost.
 *
 * Anti-patterns:
 *  - Do not animate the trajectories. The card communicates evidence, not
 *    decoration; motion would distract from the comparison.
 *  - Do not infer cohort percentages from these inputs — the card is a
 *    presentation surface only. The data layer enforces minimum-N suppression.
 */
export type EvidenceCardKind = "training-curve" | "metric-table" | "figure";

export interface EvidenceTrajectory {
  name: string;
  /**
   * Sequence of `[x, y]` data points. We expect a small set (~6–24); the
   * curve renderer normalises to the SVG viewBox automatically.
   */
  points: ReadonlyArray<readonly [number, number]>;
  /**
   * Visual tone. `plain` uses the muted text token; `residual` uses the
   * accent — pair the canonical/residual run with `residual` so it pops.
   */
  tone: "plain" | "residual";
}

export interface EvidenceCardData {
  /** Trajectories rendered by `kind: 'training-curve'`. */
  trajectories?: ReadonlyArray<EvidenceTrajectory>;
  /** Rows rendered by `kind: 'metric-table'`. */
  rows?: ReadonlyArray<{
    label: string;
    values: ReadonlyArray<string>;
  }>;
  /** Optional column headers for `metric-table`. */
  columns?: ReadonlyArray<string>;
  /** Caption rendered under the figure for `kind: 'figure'`. */
  alt?: string;
}

export interface EvidenceCardProps {
  kind: EvidenceCardKind;
  caption: string;
  data?: EvidenceCardData;
  className?: string;
}

const SVG_WIDTH = 280;
const SVG_HEIGHT = 160;
const PAD_X = 28;
const PAD_Y = 18;

function normalisePoints(
  points: ReadonlyArray<readonly [number, number]>,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
): string {
  if (points.length === 0) return "";
  const w = SVG_WIDTH - PAD_X * 2;
  const h = SVG_HEIGHT - PAD_Y * 2;
  const xRange = Math.max(1e-6, bounds.maxX - bounds.minX);
  const yRange = Math.max(1e-6, bounds.maxY - bounds.minY);
  return points
    .map(([x, y], i) => {
      const px = PAD_X + ((x - bounds.minX) / xRange) * w;
      const py =
        SVG_HEIGHT - PAD_Y - ((y - bounds.minY) / yRange) * h;
      return `${i === 0 ? "M" : "L"}${px.toFixed(2)},${py.toFixed(2)}`;
    })
    .join(" ");
}

function computeBounds(
  trajectories: ReadonlyArray<EvidenceTrajectory>,
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of trajectories) {
    for (const [x, y] of t.points) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return { minX, maxX, minY, maxY };
}

function TrainingCurve({
  trajectories,
}: {
  trajectories: ReadonlyArray<EvidenceTrajectory>;
}) {
  const bounds = computeBounds(trajectories);
  return (
    <div className="flex flex-col gap-2">
      <svg
        role="img"
        aria-label="Training curve evidence"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full"
        style={{ height: "auto", maxHeight: SVG_HEIGHT }}
      >
        {/* Axes — minimal, just the baseline + left rule. */}
        <line
          x1={PAD_X}
          y1={SVG_HEIGHT - PAD_Y}
          x2={SVG_WIDTH - PAD_X}
          y2={SVG_HEIGHT - PAD_Y}
          stroke="var(--color-rc-border)"
          strokeWidth={1}
        />
        <line
          x1={PAD_X}
          y1={PAD_Y}
          x2={PAD_X}
          y2={SVG_HEIGHT - PAD_Y}
          stroke="var(--color-rc-border)"
          strokeWidth={1}
        />

        {/* Trajectories. */}
        {trajectories.map((t, idx) => (
          <path
            key={`${t.name}-${idx}`}
            d={normalisePoints(t.points, bounds)}
            fill="none"
            stroke={
              t.tone === "residual"
                ? "var(--color-rc-accent)"
                : "var(--color-rc-text-subtle)"
            }
            strokeWidth={t.tone === "residual" ? 2 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={t.tone === "residual" ? 1 : 0.85}
          />
        ))}

        {/* Axis labels — quiet mono. */}
        <text
          x={PAD_X - 4}
          y={PAD_Y + 4}
          textAnchor="end"
          fontFamily="var(--font-rc-mono)"
          fontSize={9}
          fill="var(--color-rc-text-subtle)"
        >
          {bounds.maxY.toFixed(2)}
        </text>
        <text
          x={PAD_X - 4}
          y={SVG_HEIGHT - PAD_Y}
          textAnchor="end"
          fontFamily="var(--font-rc-mono)"
          fontSize={9}
          fill="var(--color-rc-text-subtle)"
        >
          {bounds.minY.toFixed(2)}
        </text>
        <text
          x={SVG_WIDTH - PAD_X}
          y={SVG_HEIGHT - 4}
          textAnchor="end"
          fontFamily="var(--font-rc-mono)"
          fontSize={9}
          fill="var(--color-rc-text-subtle)"
        >
          step {bounds.maxX.toFixed(0)}
        </text>
      </svg>

      {/* Legend underneath. */}
      <ul className="flex flex-wrap gap-3 text-[--text-rc-xs] text-[--color-rc-text-muted]">
        {trajectories.map((t) => (
          <li
            key={t.name}
            className="inline-flex items-center gap-1.5 font-[--font-rc-mono]"
          >
            <span
              aria-hidden
              className={cn(
                "block h-[2px] w-4 rounded-full",
                t.tone === "residual"
                  ? "bg-[--color-rc-accent]"
                  : "bg-[--color-rc-text-subtle]",
              )}
            />
            {t.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricTable({
  data,
}: {
  data: EvidenceCardData;
}) {
  const rows = data.rows ?? [];
  const columns = data.columns ?? [];
  return (
    <table className="w-full border-collapse text-[--text-rc-sm]">
      {columns.length > 0 ? (
        <thead>
          <tr>
            <th className="border-b border-[--color-rc-border] py-1.5 text-left text-[--text-rc-xs] font-[--font-rc-mono] uppercase tracking-wide text-[--color-rc-text-subtle]">
              metric
            </th>
            {columns.map((c) => (
              <th
                key={c}
                className="border-b border-[--color-rc-border] py-1.5 text-right text-[--text-rc-xs] font-[--font-rc-mono] uppercase tracking-wide text-[--color-rc-text-subtle]"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
      ) : null}
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td className="border-b border-[--color-rc-border]/60 py-1.5 pr-3 text-[--color-rc-text]">
              {row.label}
            </td>
            {row.values.map((v, i) => (
              <td
                key={`${row.label}-${i}`}
                className="border-b border-[--color-rc-border]/60 py-1.5 text-right font-[--font-rc-mono] text-[--color-rc-text]"
              >
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FigurePlaceholder({ alt }: { alt?: string }) {
  return (
    <div
      role="img"
      aria-label={alt ?? "Figure placeholder"}
      className={cn(
        "relative flex aspect-[16/9] w-full items-center justify-center",
        "rounded-[--radius-rc-md] border border-dashed border-[--color-rc-border]",
        "bg-[--color-rc-surface]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-[--radius-rc-md]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, var(--color-rc-border) 1px, transparent 0)",
          backgroundSize: "10px 10px",
          opacity: 0.6,
        }}
      />
      <span className="relative font-[--font-rc-mono] text-[--text-rc-xs] uppercase tracking-[0.1em] text-[--color-rc-text-subtle]">
        figure
      </span>
    </div>
  );
}

export function EvidenceCard({
  kind,
  caption,
  data,
  className,
}: EvidenceCardProps) {
  return (
    <figure
      className={cn(
        "flex flex-col gap-3 rounded-[--radius-rc-lg] border border-[--color-rc-border]",
        "bg-[--color-rc-surface] p-4",
        className,
      )}
      data-evidence-kind={kind}
    >
      {kind === "training-curve" ? (
        <TrainingCurve trajectories={data?.trajectories ?? []} />
      ) : kind === "metric-table" ? (
        <MetricTable data={data ?? {}} />
      ) : (
        <FigurePlaceholder
          {...(data?.alt !== undefined ? { alt: data.alt } : {})}
        />
      )}
      <figcaption className="text-[--text-rc-xs] leading-relaxed text-[--color-rc-text-muted]">
        {caption}
      </figcaption>
    </figure>
  );
}
