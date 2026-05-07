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
        "transition-colors duration-[--duration-rc-fast] hover:border-[--color-rc-border-strong]",
        className,
      )}
    >
      <CardBody>
        <Wrapper
          href={href}
          onClick={onClick}
          className="block focus-visible:outline-none"
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="text-[--text-rc-md] font-semibold truncate">
              {title}
            </h3>
            {releaseStatus &&
            releaseStatus !== "stable" &&
            releaseStatus !== "live" ? (
              <span className="text-[--text-rc-xs] uppercase tracking-wide text-[--color-rc-text-muted]">
                {releaseStatus}
              </span>
            ) : null}
          </div>
          {paperTitle ? (
            <p className="text-[--text-rc-xs] text-[--color-rc-text-muted] mb-1">
              {paperTitle}
            </p>
          ) : null}
          <p className="text-[--text-rc-sm] text-[--color-rc-text-muted] mb-2">
            {pitch}
          </p>

          <ul className="flex flex-wrap gap-1 mb-2">
            {skills.map((s) => (
              <li
                key={s}
                className="inline-flex items-center rounded-[--radius-rc-sm] border border-[--color-rc-border] px-1.5 py-0.5 text-[--text-rc-xs] text-[--color-rc-text-muted]"
              >
                {s}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2 text-[--text-rc-xs] text-[--color-rc-text-muted]">
            <span>
              {difficulty}
              {timeLabel ? ` • ${timeLabel}` : ""}
            </span>
            <div className="flex items-center gap-1.5">
              {previewBudget !== undefined && previewBudget > 0 ? (
                <span>{previewBudget} free preview</span>
              ) : null}
              {status ? (
                <StatusBadge
                  status={status}
                  size="sm"
                  label={STATE_LABEL[state]}
                />
              ) : (
                <span>{STATE_LABEL[state]}</span>
              )}
            </div>
          </div>

          {state === "in_progress" && progress !== undefined ? (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-[--radius-rc-sm] bg-[--color-rc-surface-muted]">
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
