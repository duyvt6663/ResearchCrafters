import * as React from "react";
import { cn } from "../lib/cn.js";

/**
 * PackageOverview — marketing surface for a single package.
 *
 * Renders the package's title, paper, promise, prerequisites, skills, stage
 * outline, and a primary CTA. Web pages pass the same shape they receive
 * from their data layer; this component is intentionally presentational so
 * the data contract can evolve without churning the layout.
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
        "flex flex-col gap-4 px-4 py-6",
        className,
      )}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[--text-rc-2xl] font-semibold leading-tight">
            {title}
          </h1>
          {releaseStatus ? (
            <span className="text-[--text-rc-xs] uppercase tracking-wide text-[--color-rc-text-muted]">
              {releaseStatus}
            </span>
          ) : null}
        </div>
        <p className="text-[--text-rc-sm] text-[--color-rc-text-muted]">
          {paperTitle}
        </p>
        <p className="text-[--text-rc-md]">{oneLinePromise}</p>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-[--text-rc-sm] sm:grid-cols-4">
        <div>
          <dt className="text-[--color-rc-text-muted]">Difficulty</dt>
          <dd>{difficulty}</dd>
        </div>
        <div>
          <dt className="text-[--color-rc-text-muted]">Estimated time</dt>
          <dd>{estimatedMinutes} min</dd>
        </div>
        <div>
          <dt className="text-[--color-rc-text-muted]">Free preview</dt>
          <dd>{freeStageCount} stages</dd>
        </div>
        <div>
          <dt className="text-[--color-rc-text-muted]">Skills</dt>
          <dd>{skills.join(", ")}</dd>
        </div>
      </dl>

      {prerequisites.length > 0 ? (
        <section>
          <h2 className="text-[--text-rc-md] font-semibold mb-1">
            Prerequisites
          </h2>
          <ul className="flex flex-wrap gap-1">
            {prerequisites.map((p) => (
              <li
                key={p}
                className="inline-flex items-center rounded-[--radius-rc-sm] border border-[--color-rc-border] px-1.5 py-0.5 text-[--text-rc-xs] text-[--color-rc-text-muted]"
              >
                {p}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {whatYouWillPractice.length > 0 ? (
        <section>
          <h2 className="text-[--text-rc-md] font-semibold mb-1">
            What you will practice
          </h2>
          <ul className="list-disc list-inside text-[--text-rc-sm] text-[--color-rc-text]">
            {whatYouWillPractice.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-[--text-rc-md] font-semibold mb-1">Stages</h2>
        <ol className="flex flex-col gap-1.5">
          {stages.map((stage, idx) => (
            <li
              key={stage.ref}
              className="flex items-center justify-between gap-2 rounded-[--radius-rc-sm] border border-[--color-rc-border] px-3 py-2 text-[--text-rc-sm]"
            >
              <div className="min-w-0 flex-1">
                <span className="font-[--font-rc-mono] text-[--color-rc-text-muted] mr-2">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="font-medium">{stage.title}</span>
                <span className="ml-2 text-[--color-rc-text-muted] text-[--text-rc-xs]">
                  {stage.type} • {stage.estimatedMinutes} min
                </span>
              </div>
              {stage.isFreePreview ? (
                <span className="flex-none rounded-[--radius-rc-sm] border border-[--color-rc-border] px-1.5 py-0.5 text-[--text-rc-xs] text-[--color-rc-text-muted]">
                  Free preview
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <a
        href={ctaHref}
        className="inline-flex w-fit items-center justify-center rounded-[--radius-rc-md] bg-[--color-rc-accent] px-4 py-2 text-[--text-rc-sm] font-medium text-[--color-rc-on-accent] hover:bg-[--color-rc-accent-hover]"
      >
        {ctaLabel}
      </a>
    </section>
  );
}
