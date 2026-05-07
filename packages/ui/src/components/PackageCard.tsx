import * as React from "react";
import { cn } from "../lib/cn.js";
import { Card, CardBody } from "./Card.js";
import { StatusBadge } from "./StatusBadge.js";
import type { StatusKey } from "../tokens.js";

/**
 * PackageCard — catalog tile. The catalog is one of the few places where
 * cards are appropriate (per `docs/FRONTEND.md` section 4: cards for
 * repeated items). Do NOT nest other cards inside.
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
  return (
    <Card
      as="article"
      className={cn(
        "group h-full overflow-hidden transition-colors duration-[--duration-rc-fast]",
        // Border-color shift only — no scale/translate motion (FRONTEND.md §4).
        href && "hover:border-[--color-rc-border-strong]",
        className,
      )}
    >
      <CardBody className="flex h-full flex-col gap-3 p-5">
        <Wrapper
          href={href}
          onClick={onClick}
          className="flex h-full flex-col gap-3 focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[--text-rc-lg] font-semibold leading-snug text-[--color-rc-text]">
              {title}
            </h3>
            {releaseStatus &&
            releaseStatus !== "stable" &&
            releaseStatus !== "live" ? (
              <span
                className={cn(
                  "flex-none rounded-[--radius-rc-sm] border border-[--color-rc-border]",
                  "px-1.5 py-0.5 text-[--text-rc-xs] uppercase tracking-wide",
                  "text-[--color-rc-text-muted]",
                )}
              >
                {releaseStatus}
              </span>
            ) : null}
          </div>
          {paperTitle ? (
            <p className="font-[--font-rc-mono] text-[--text-rc-xs] text-[--color-rc-text-subtle]">
              {paperTitle}
            </p>
          ) : null}
          {pitch ? (
            <p className="text-[--text-rc-sm] leading-relaxed text-[--color-rc-text-muted]">
              {pitch}
            </p>
          ) : null}

          {skills.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <li
                  key={s}
                  className={cn(
                    "inline-flex items-center rounded-[--radius-rc-sm]",
                    "border border-[--color-rc-border] bg-[--color-rc-bg]",
                    "px-2 py-0.5 text-[--text-rc-xs] text-[--color-rc-text-muted]",
                  )}
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : null}

          {/* Footer pinned to bottom so cards line up in the grid. */}
          <div
            className={cn(
              "mt-auto flex items-center justify-between gap-2 pt-2",
              "border-t border-[--color-rc-border] text-[--text-rc-xs]",
              "text-[--color-rc-text-muted]",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="font-medium text-[--color-rc-text]">
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
      </CardBody>
    </Card>
  );
}
