import type { ReactElement } from "react";
import Link from "next/link";
import {
  experiments,
  type ExperimentModule,
  type ExperimentStatus,
} from "./_registry";

/**
 * /experiments — index of UX experiments. Reviewer-facing only; not linked
 * from the marketing nav. See `experiments/README.md` for the workflow.
 */

export const metadata = {
  title: "UX Experiments — ResearchCrafters",
  description:
    "Sandbox for UI/UX proposals that have not been integrated yet.",
};

const MODULE_LABEL: Record<ExperimentModule, string> = {
  math: "math",
  writing: "writing",
  coding: "coding",
  shared: "shared",
};

const STATUS_TONE: Record<ExperimentStatus, string> = {
  draft:
    "border-(--color-rc-border) bg-(--color-rc-surface-muted) text-(--color-rc-text-muted)",
  validated:
    "border-(--color-rc-info) bg-(--color-rc-info-subtle) text-(--color-rc-info)",
  promoted:
    "border-(--color-rc-icon-accent) bg-(--color-rc-icon-accent-soft) text-(--color-rc-icon-accent)",
  dropped:
    "border-(--color-rc-danger) bg-(--color-rc-danger-subtle) text-(--color-rc-danger)",
};

export default function ExperimentsIndexPage(): ReactElement {
  const entries = Object.values(experiments);

  return (
    <main className="mx-auto w-full max-w-[1080px] px-6 py-12 lg:px-8">
      <header className="mb-8 flex flex-col gap-2">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
          Sandbox
        </span>
        <h1 className="text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)">
          UX Experiments
        </h1>
        <p className="max-w-2xl text-(--text-rc-md) leading-[1.6] text-(--color-rc-text-muted)">
          Mocks of UI/UX proposals that have <em>not</em> been integrated yet.
          Each entry pairs a runnable mock with a writeup describing the
          hypothesis, validation criteria, and integration sketch. See{" "}
          <code className="font-(--font-rc-mono) text-(--text-rc-sm)">
            experiments/README.md
          </code>{" "}
          for the workflow.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="rounded-(--radius-rc-md) border border-dashed border-(--color-rc-border) p-8 text-center text-(--color-rc-text-muted)">
          No experiments registered yet. Copy{" "}
          <code className="font-(--font-rc-mono)">experiments/TEMPLATE/</code>{" "}
          to seed one.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((e) => (
            <li key={e.slug}>
              <Link
                href={`/experiments/${e.slug}`}
                className="flex flex-col gap-2 rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-4 transition-colors hover:border-(--color-rc-accent)"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-1.5 py-0.5 font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-muted)">
                    {MODULE_LABEL[e.module]}
                  </span>
                  <h2 className="text-(--text-rc-lg) font-semibold text-(--color-rc-text)">
                    {e.title}
                  </h2>
                  <span
                    className={`rounded-(--radius-rc-sm) border px-1.5 py-0.5 font-(--font-rc-mono) text-(--text-rc-xs) ${STATUS_TONE[e.status]}`}
                  >
                    {e.status}
                  </span>
                </div>
                <p className="text-(--text-rc-sm) leading-snug text-(--color-rc-text-muted)">
                  {e.summary}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
