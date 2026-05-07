import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";
import type { StatusKey } from "../tokens.js";

/**
 * PackageCard — catalog tile.
 *
 * The catalog is one of the few places where cards are appropriate (per
 * `docs/FRONTEND.md` section 4: cards for repeated items). Do NOT nest other
 * cards inside.
 *
 * Visual contract (refresh, 2026-05):
 *  - 4px top border tinted by `releaseStatus` (alpha = warning, beta =
 *    accent, live = success, archived = muted) so the catalog grid reads at
 *    a glance.
 *  - Hero area: title in display-md (40px), paper title above in mono
 *    eyebrow tone.
 *  - Skills as chip pills with a leading `Sparkles` icon.
 *  - Hover (when `href` is set): border shifts to accent + 1px translate
 *    upward, gated by `prefers-reduced-motion: no-preference` via the
 *    shared `[data-hover-lift]` rule in styles.css.
 *  - Focus-visible: accent ring on the wrapper.
 */
export type PackageCardState =
  | "not_started"
  | "preview"
  | "in_progress"
  | "completed"
  | "locked";

export interface PackageCardProps {
  /** Canonical title. Web pages also pass `paperTitle` separately for clarity. */
  title: string;
  /**
   * Short pitch. The web app passes this as `oneLinePromise` from the data
   * layer; we accept either name to avoid forcing a transform at the call
   * site.
   */
  promise?: string;
  /** Alias for `promise` matching the data-layer field name. */
  oneLinePromise?: string;
  /** Source paper title; surfaced under the card title when supplied. */
  paperTitle?: string;
  /** Stage skills. `readonly` so callers may pass frozen arrays directly. */
  skills: ReadonlyArray<string>;
  difficulty: string;
  /** Pre-formatted time string. Web app passes `estimatedMinutes` instead. */
  estimatedTime?: string;
  /** Numeric estimated time in minutes — used when `estimatedTime` is absent. */
  estimatedMinutes?: number;
  /** Free preview budget — accepts both shapes the web app uses. */
  freePreviewCount?: number;
  freeStageCount?: number;
  /** Lifecycle. Defaults to `not_started` when `state` is omitted. */
  state?: PackageCardState;
  /** Progress 0-100 if `state === "in_progress"`. */
  progress?: number;
  /**
   * Release lifecycle. Aligned with `@researchcrafters/erp-schema`
   * `package.yaml.status` (`alpha | beta | live | archived`); `stable` is
   * accepted as a legacy alias.
   */
  releaseStatus?: "alpha" | "beta" | "live" | "stable" | "archived";
  href?: string;
  onClick?: () => void;
  className?: string;
}

const STATE_TO_STATUS: Record<PackageCardState, StatusKey | null> = {
  not_started: null,
  preview: "in_progress",
  in_progress: "in_progress",
  completed: "completed",
  locked: "locked",
};

const STATE_LABEL: Record<PackageCardState, string> = {
  not_started: "Not started",
  preview: "Preview available",
  in_progress: "In progress",
  completed: "Completed",
  locked: "Locked",
};

const RELEASE_TINT: Record<string, string> = {
  alpha: "var(--color-rc-warning)",
  beta: "var(--color-rc-accent)",
  live: "var(--color-rc-success)",
  stable: "var(--color-rc-success)",
  archived: "var(--color-rc-locked)",
};

export function PackageCard({
  title,
  promise,
  oneLinePromise,
  paperTitle,
  skills,
  difficulty,
  estimatedTime,
  estimatedMinutes,
  freePreviewCount,
  freeStageCount,
  state = "not_started",
  progress,
  releaseStatus,
  href,
  onClick,
  className,
}: PackageCardProps) {
  const status = STATE_TO_STATUS[state];
  const Wrapper: React.ElementType = href ? "a" : "div";
  const pitch = promise ?? oneLinePromise ?? "";
  const timeLabel =
    estimatedTime ??
    (estimatedMinutes !== undefined ? `${estimatedMinutes} min` : "");
  const previewBudget = freePreviewCount ?? freeStageCount;
  const topBorder = releaseStatus
    ? (RELEASE_TINT[releaseStatus] ?? "var(--color-rc-border-strong)")
    : "var(--color-rc-border-strong)";

  return (
    <article
      data-card="true"
      data-hover-lift={href ? "true" : undefined}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden",
        "rounded-[--radius-rc-lg] border border-[--color-rc-border]",
        "bg-[--color-rc-surface] text-[--color-rc-text]",
        className,
      )}
    >
      {/* Status-tinted top border — a 4px hairline, status-coded. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: topBorder }}
      />

      <Wrapper
        href={href}
        onClick={onClick}
        className={cn(
          "flex h-full flex-col gap-3 p-5 pt-6",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--color-rc-accent] focus-visible:ring-offset-2 focus-visible:ring-offset-[--color-rc-bg]",
        )}
      >
        {paperTitle ? (
          <p className="font-[--font-rc-mono] text-[10px] uppercase tracking-[0.12em] text-[--color-rc-text-subtle]">
            {paperTitle}
          </p>
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <h3
            className={cn(
              "text-[--text-rc-2xl] font-bold leading-[1.15] tracking-[-0.01em]",
              "text-[--color-rc-text] transition-colors duration-[--duration-rc-fast]",
              href && "group-hover:text-[--color-rc-accent]",
            )}
          >
            {title}
          </h3>
          {releaseStatus &&
          releaseStatus !== "stable" &&
          releaseStatus !== "live" ? (
            <span
              className={cn(
                "flex-none rounded-[--radius-rc-sm] border px-1.5 py-0.5",
                "text-[10px] font-[--font-rc-mono] uppercase tracking-[0.08em]",
              )}
              style={{
                color: RELEASE_TINT[releaseStatus],
                borderColor: RELEASE_TINT[releaseStatus],
              }}
            >
              {releaseStatus}
            </span>
          ) : null}
        </div>

        {pitch ? (
          <p className="text-[--text-rc-sm] leading-[1.6] text-[--color-rc-text-muted]">
            {pitch}
          </p>
        ) : null}

        {skills.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <li
                key={s}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[--radius-rc-sm]",
                  "border border-[--color-rc-border] bg-[--color-rc-bg]",
                  "px-2 py-0.5 text-[--text-rc-xs] text-[--color-rc-text-muted]",
                )}
              >
                <Sparkles
                  size={10}
                  aria-hidden
                  className="text-[--color-rc-accent]"
                />
                {s}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Footer pinned to bottom — difficulty / time / free, separated by `·`. */}
        <div
          className={cn(
            "mt-auto flex items-center justify-between gap-2 pt-3",
            "border-t border-[--color-rc-border] text-[--text-rc-xs]",
            "text-[--color-rc-text-muted]",
          )}
        >
          <span className="inline-flex items-center gap-1.5 font-[--font-rc-mono]">
            <span className="font-medium uppercase tracking-wide text-[--color-rc-text]">
              {difficulty}
            </span>
            {timeLabel ? (
              <>
                <span aria-hidden>·</span>
                <span>{timeLabel}</span>
              </>
            ) : null}
            {previewBudget !== undefined && previewBudget > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>{previewBudget} free</span>
              </>
            ) : null}
          </span>
          {status ? (
            <StatusBadge
              status={status}
              size="sm"
              label={STATE_LABEL[state]}
            />
          ) : (
            <span className="text-[--color-rc-text-subtle]">
              {STATE_LABEL[state]}
            </span>
          )}
        </div>

        {state === "in_progress" && progress !== undefined ? (
          <div className="h-1 w-full overflow-hidden rounded-[--radius-rc-sm] bg-[--color-rc-surface-muted]">
            <div
              className="h-full bg-[--color-rc-accent]"
              style={{
                width: `${Math.max(0, Math.min(100, progress))}%`,
              }}
              aria-hidden
            />
          </div>
        ) : null}
      </Wrapper>
    </article>
  );
}
