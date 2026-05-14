import type { ReactElement } from "react";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose } from "@researchcrafters/ui/components";
import {
  experiments,
  experimentSlugs,
  type ExperimentEntry,
} from "../_registry";

/**
 * /experiments/<slug> — renders the writeup (from
 * `experiments/<slug>/README.md`) alongside the live mock component.
 *
 * Static params come from the registry so dev links light up immediately
 * and `next build` materialises a page for every registered experiment.
 */

export function generateStaticParams(): Array<{ slug: string }> {
  return experimentSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<{ title: string }> {
  const { slug } = await params;
  const entry = experiments[slug];
  return {
    title: entry
      ? `${entry.title} — Experiments — ResearchCrafters`
      : "Experiment not found — ResearchCrafters",
  };
}

async function loadWriteup(slug: string): Promise<string> {
  // `process.cwd()` in dev/build is `apps/web/`; experiments live alongside
  // `app/` at `apps/web/experiments/<slug>/README.md`.
  const fp = path.join(process.cwd(), "experiments", slug, "README.md");
  try {
    return await readFile(fp, "utf-8");
  } catch {
    return "_(writeup `README.md` missing — see `experiments/TEMPLATE/README.md`.)_";
  }
}

export default async function ExperimentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const entry: ExperimentEntry | undefined = experiments[slug];
  if (!entry) notFound();

  const writeup = await loadWriteup(slug);
  const MockComponent = entry.Mock;

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 py-10 lg:px-8">
      <nav className="mb-6 flex items-center gap-2 text-(--text-rc-sm) text-(--color-rc-text-muted)">
        <Link
          href="/experiments"
          className="hover:text-(--color-rc-text) hover:underline"
        >
          ← All experiments
        </Link>
      </nav>

      <header className="mb-8 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-1.5 py-0.5 font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-muted)">
            {entry.module}
          </span>
          <span className="rounded-(--radius-rc-sm) border border-(--color-rc-border) bg-(--color-rc-surface) px-1.5 py-0.5 font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-text-muted)">
            {entry.status}
          </span>
        </div>
        <h1 className="text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)">
          {entry.title}
        </h1>
        <p className="max-w-2xl text-(--text-rc-md) leading-[1.6] text-(--color-rc-text-muted)">
          {entry.summary}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* LEFT: live mock */}
        <section
          aria-label="Live mock"
          className="flex flex-col gap-3"
          data-rc-experiment-pane="mock"
        >
          <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            Live mock
          </span>
          <MockComponent />
        </section>

        {/* RIGHT: writeup */}
        <aside
          aria-label="Writeup"
          className="flex flex-col gap-3"
          data-rc-experiment-pane="writeup"
        >
          <span className="font-(--font-rc-mono) text-(--text-rc-xs) uppercase tracking-[0.08em] text-(--color-rc-text-subtle)">
            Writeup ·{" "}
            <code className="font-(--font-rc-mono) text-(--text-rc-xs)">
              experiments/{slug}/README.md
            </code>
          </span>
          <div className="rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-bg) p-5">
            <Prose size="sm">{writeup}</Prose>
          </div>
        </aside>
      </div>
    </main>
  );
}
