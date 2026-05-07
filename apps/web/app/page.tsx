import type { ReactElement, ReactNode } from "react";
import {
  CatalogFilters,
  CommandBlock,
  EmptyState,
  PackageCard,
} from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import { listPackages } from "@/lib/data/packages";
import { track } from "@/lib/telemetry";

/**
 * Opt out of static prerender: this page reads the package catalog from Prisma
 * (via `lib/data/packages`), and Prisma must not run at build time without a
 * live `DATABASE_URL`. Forcing dynamic rendering moves the query to request
 * time so `pnpm build` does not crash on a missing env.
 */
export const dynamic = "force-dynamic";

export default async function CatalogPage(): Promise<ReactElement> {
  const packages = await listPackages();

  // Catalog view is the primary marketing surface; record the visit.
  await track("package_viewed", { surface: "catalog", count: packages.length });

  const firstPackage = packages[0];
  const heroSlug = firstPackage?.slug ?? "flash-attention";

  return (
    <main className="rc-page rc-page--catalog">
      {/* Hero band — the catalog is the marketing surface (MARKETING.md §11).
          Two-column split: display headline + CTA on the left, terminal
          CommandBlock on the right with a typing animation that introduces
          the canonical CLI loop. */}
      <header className="relative overflow-hidden border-b border-(--color-rc-border) bg-(--color-rc-surface)">
        <div className="rc-hero-grid absolute inset-0 opacity-60" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1280px] px-6 py-20 lg:px-8 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[7fr_5fr] lg:items-center">
            <div className="flex flex-col gap-6 rc-anim-fade-up">
              <span className="rc-eyebrow">
                The research-engineering gym
              </span>
              <h1 className="rc-display-xl text-(--color-rc-text)">
                {copy.landing.heroTitle}
              </h1>
              <p className="max-w-xl text-(--text-rc-lg) leading-[1.6] text-(--color-rc-text-muted)">
                {copy.landing.heroSubtitle}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {firstPackage ? (
                  <a
                    href={`/packages/${firstPackage.slug}`}
                    className={
                      "inline-flex items-center gap-1.5 rounded-(--radius-rc-md) " +
                      "bg-(--color-rc-accent) px-4 py-2.5 text-(--text-rc-md) font-semibold " +
                      "text-(--color-rc-accent-foreground) transition-colors duration-(--duration-rc-fast) " +
                      "hover:bg-(--color-rc-accent-hover)"
                    }
                  >
                    <span>Try the first decision</span>
                    <span aria-hidden>→</span>
                  </a>
                ) : null}
                <a
                  href="#catalog"
                  className={
                    "inline-flex items-center gap-1.5 rounded-(--radius-rc-md) " +
                    "border border-(--color-rc-border) bg-(--color-rc-bg) px-4 py-2.5 " +
                    "text-(--text-rc-md) font-medium text-(--color-rc-text) " +
                    "transition-colors duration-(--duration-rc-fast) " +
                    "hover:border-(--color-rc-border-strong)"
                  }
                >
                  Browse the catalog
                </a>
              </div>
            </div>

            <div className="rc-anim-fade-up rc-anim-fade-up--delay-1">
              {/* Terminal hero — the brand surface. Output lines mimic a
                  fresh `start → test → submit` loop so the visitor knows
                  exactly what they are buying into. */}
              <CommandBlock
                title={`~/research/${heroSlug}`}
                typing
                commands={[
                  `researchcrafters start ${heroSlug}`,
                  "researchcrafters test",
                  "researchcrafters submit",
                ]}
                output={[
                  { line: "→ scaffolded 4 stages", tone: "muted" },
                  { line: "PASS  test_residual_block.py", tone: "success" },
                  { line: "PASS  test_grad_flow.py", tone: "success" },
                  { line: "submitted attempt #1 (graded)", tone: "muted" },
                ]}
              />
            </div>
          </div>
        </div>
      </header>

      {/* "How it works" 3-step horizontal band. Inline SVGs keep this
          marketing-grade without any asset dependency. */}
      <section
        aria-label="How ResearchCrafters works"
        className="border-b border-(--color-rc-border) bg-(--color-rc-bg)"
      >
        <div className="mx-auto grid w-full max-w-[1280px] gap-6 px-6 py-12 sm:grid-cols-3 lg:px-8">
          <HowStep
            index="01"
            title="Decide"
            body="Sit at the moment of choice. Read the situation, choose a branch, justify it."
            icon={<DecideGlyph />}
          />
          <HowStep
            index="02"
            title="Build"
            body="Implement the canonical move locally. CLI scaffolds the project, you write the math."
            icon={<BuildGlyph />}
          />
          <HowStep
            index="03"
            title="Test"
            body="Run, submit, and inspect evidence. Compare your trajectory with the paper's."
            icon={<TestGlyph />}
          />
        </div>
      </section>

      <section
        id="catalog"
        className="mx-auto w-full max-w-[1280px] px-6 py-14 lg:px-8"
      >
        <div className="mb-8 flex flex-col gap-1">
          <span className="rc-eyebrow">Catalog</span>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-(--text-rc-3xl) font-bold leading-tight tracking-[-0.01em] text-(--color-rc-text)">
              Pick a paper, rebuild its research.
            </h2>
            <CatalogFilters className="hidden md:flex" />
          </div>
          <p className="max-w-2xl text-(--text-rc-md) text-(--color-rc-text-muted)">
            {packages.length === 1
              ? "One package, fully tested end-to-end."
              : `${packages.length} packages available — each with a free preview stage.`}
          </p>
        </div>

        {packages.length === 0 ? (
          <EmptyState
            title={copy.emptyStates.emptyCatalog.title}
            body={copy.emptyStates.emptyCatalog.body}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <li key={pkg.slug} className="flex">
                <PackageCard
                  href={`/packages/${pkg.slug}`}
                  title={pkg.title}
                  paperTitle={pkg.paperTitle}
                  oneLinePromise={pkg.oneLinePromise}
                  skills={pkg.skills}
                  difficulty={pkg.difficulty}
                  estimatedMinutes={pkg.estimatedMinutes}
                  freeStageCount={pkg.freeStageCount}
                  releaseStatus={pkg.releaseStatus}
                  className="w-full"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

/**
 * `HowStep` and the three glyphs are inlined here because they are tiny,
 * single-use compositions that don't earn their own UI primitive. Pure SVG,
 * no asset fetches, no animation — workbench tone preserved.
 */
function HowStep({
  index,
  title,
  body,
  icon,
}: {
  index: string;
  title: string;
  body: string;
  icon: ReactNode;
  // Keep the prop signature explicit so callers can swap glyphs.
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-(--font-rc-mono) text-(--text-rc-xs) text-(--color-rc-accent)">
          {index}
        </span>
        <span aria-hidden className="h-px flex-1 bg-(--color-rc-border)" />
      </div>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-(--radius-rc-md) border border-(--color-rc-border) bg-(--color-rc-surface) text-(--color-rc-accent)"
        >
          {icon}
        </span>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-(--text-rc-lg) font-semibold text-(--color-rc-text)">
            {title}
          </h3>
          <p className="text-(--text-rc-sm) leading-[1.6] text-(--color-rc-text-muted)">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}

function DecideGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="6" cy="10" r="2" />
      <circle cx="14" cy="5" r="2" />
      <circle cx="14" cy="15" r="2" />
      <path d="M8 10 L12 5" />
      <path d="M8 10 L12 15" />
    </svg>
  );
}

function BuildGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 5 L8 5 L10 7 L17 7 L17 16 L3 16 Z" />
      <path d="M7 11 L9 13 L13 9" />
    </svg>
  );
}

function TestGlyph() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 16 L7 10 L11 13 L17 4" />
      <path d="M13 4 L17 4 L17 8" />
    </svg>
  );
}
