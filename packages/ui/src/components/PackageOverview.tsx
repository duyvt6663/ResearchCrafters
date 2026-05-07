import * as React from "react";
import { cn } from "../lib/cn.js";
import { StatusBadge } from "./StatusBadge.js";
import { Card, CardBody, CardHeader } from "./Card.js";

/**
 * PackageOverview — package detail surface.
 *
 * Renders title, paper, promise, prerequisites, skills, "what you'll
 * practice", a numbered stage list, and a sticky-on-desktop summary card on
 * the right with difficulty/time/free-stages and the primary "Start" CTA
 * (per `docs/FRONTEND.md` §7).
 *
 * Web pages pass the same shape they receive from their data layer; this
 * component is intentionally presentational so the data contract can evolve
 * without churning the layout. Prop interface is unchanged.
 *
 * Anti-pattern check: the right-rail uses `Card` once. We deliberately keep
 * the left column unwrapped — never put cards inside cards (`data-card`
 * containment is enforced in `styles.css`).
 */
export interface PackageOverviewStage {
  ref: string;
  title: string;
  type: string;
  estimatedMinutes: number;
  isFreePreview: boolean;
}

export interface PackageOverviewProps {
  title: string;
  paperTitle: string;
  oneLinePromise: string;
  skills: ReadonlyArray<string>;
  prerequisites: ReadonlyArray<string>;
  difficulty: string;
  estimatedMinutes: number;
  freeStageCount: number;
  /** Release lifecycle. Accepts both legacy `stable` and authoring `live`. */
  releaseStatus?: "alpha" | "beta" | "live" | "stable" | "archived";
  whatYouWillPractice: ReadonlyArray<string>;
  stages: ReadonlyArray<PackageOverviewStage>;
  ctaLabel: string;
  ctaHref: string;
  className?: string;
}

export function PackageOverview({
  title,
  paperTitle,
  oneLinePromise,
  skills,
  prerequisites,
  difficulty,
  estimatedMinutes,
  freeStageCount,
  releaseStatus,
  whatYouWillPractice,
  stages,
  ctaLabel,
  ctaHref,
  className,
}: PackageOverviewProps) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[1280px] px-6 py-10 lg:px-8",
        className,
      )}
    >
      <header className="flex flex-col gap-3 border-b border-(--color-rc-border) pb-8">
        <p className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          {paperTitle}
        </p>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-(--text-rc-3xl) font-bold leading-tight text-(--color-rc-text)">
            {title}
          </h1>
          {releaseStatus ? (
            <span
              className={cn(
                "flex-none rounded-(--radius-rc-sm) border border-(--color-rc-border)",
                "px-1.5 py-0.5 text-(--text-rc-xs) uppercase tracking-wide",
                "text-(--color-rc-text-muted)",
              )}
            >
              {releaseStatus}
            </span>
          ) : null}
        </div>
        <p className="max-w-2xl text-(--text-rc-lg) leading-relaxed text-(--color-rc-text-muted)">
          {oneLinePromise}
        </p>
      </header>

      <div className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
        {/* Left column: paper, skills, prerequisites, what you'll practice. */}
        <div className="flex min-w-0 flex-col gap-8">
          {whatYouWillPractice.length > 0 ? (
            <section>
              <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                What you will practice
              </h2>
              <ul className="flex flex-col gap-2 text-(--text-rc-sm) leading-relaxed text-(--color-rc-text)">
                {whatYouWillPractice.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-2 h-1 w-1 flex-none rounded-full bg-(--color-rc-accent)"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {skills.length > 0 ? (
            <section>
              <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                Skills trained
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <li
                    key={s}
                    className={cn(
                      "inline-flex items-center rounded-(--radius-rc-sm)",
                      "border border-(--color-rc-border) bg-(--color-rc-surface)",
                      "px-2 py-0.5 text-(--text-rc-xs) text-(--color-rc-text-muted)",
                    )}
                  >
                    {s}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {prerequisites.length > 0 ? (
            <section>
              <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                Prerequisites
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {prerequisites.map((p) => (
                  <li
                    key={p}
                    className={cn(
                      "inline-flex items-center rounded-(--radius-rc-sm)",
                      "border border-(--color-rc-border) bg-(--color-rc-surface)",
                      "px-2 py-0.5 text-(--text-rc-xs) text-(--color-rc-text-muted)",
                    )}
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-(--text-rc-md) font-semibold text-(--color-rc-text)">
              Stages
            </h2>
            <ol className="flex flex-col">
              {stages.map((stage, idx) => (
                <li
                  key={stage.ref}
                  className={cn(
                    "flex items-center justify-between gap-3 py-3 text-(--text-rc-sm)",
                    idx > 0 && "border-t border-(--color-rc-border)",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-baseline gap-3">
                    <span className="w-7 flex-none font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-subtle)">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-(--color-rc-text)">
                        {stage.title}
                      </div>
                      <div className="text-(--text-rc-xs) text-(--color-rc-text-muted)">
                        {stage.type} · {stage.estimatedMinutes} min
                      </div>
                    </div>
                  </div>
                  <StatusBadge
                    status={stage.isFreePreview ? "in_progress" : "locked"}
                    size="sm"
                    label={stage.isFreePreview ? "Free preview" : "Paid"}
                  />
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Right column: sticky summary card. */}
        <aside className="md:sticky md:top-20 md:self-start">
          <Card>
            <CardHeader>
              <h2 className="text-(--text-rc-md) font-semibold text-(--color-rc-text)">
                Summary
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-4">
              <dl className="grid grid-cols-3 gap-3 text-(--text-rc-sm)">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                    Difficulty
                  </dt>
                  <dd className="font-medium text-(--color-rc-text)">
                    {difficulty}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                    Time
                  </dt>
                  <dd className="font-medium text-(--color-rc-text)">
                    {estimatedMinutes} min
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-(--text-rc-xs) uppercase tracking-wide text-(--color-rc-text-subtle)">
                    Free
                  </dt>
                  <dd className="font-medium text-(--color-rc-text)">
                    {freeStageCount} stages
                  </dd>
                </div>
              </dl>
              <a
                href={ctaHref}
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-(--radius-rc-md)",
                  "bg-(--color-rc-accent) px-4 py-2.5 text-(--text-rc-sm) font-semibold",
                  "text-(--color-rc-on-accent) transition-colors duration-(--duration-rc-fast)",
                  "hover:bg-(--color-rc-accent-hover)",
                )}
              >
                {ctaLabel}
              </a>
              <p className="text-(--text-rc-xs) leading-relaxed text-(--color-rc-text-subtle)">
                Start with the first decision stage. Your progress is saved
                between sessions.
              </p>
            </CardBody>
          </Card>
        </aside>
      </div>
    </section>
  );
}
