import type { ReactElement } from "react";
import {
  CatalogFilters,
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

  return (
    <main className="rc-page rc-page--catalog">
      {/* Hero band — the catalog is the marketing surface (MARKETING.md §11).
          Workbench-precise: heavy display text, no decorative gradients, just a
          single dot-grid texture so the band reads as an intentional surface. */}
      <header className="rc-hero-grid border-b border-[--color-rc-border]">
        <div className="mx-auto w-full max-w-[1280px] px-6 py-20 lg:px-8 lg:py-24">
          <p className="font-[--font-rc-mono] text-[--text-rc-xs] uppercase tracking-[0.12em] text-[--color-rc-text-subtle]">
            Research engineering practice
          </p>
          <h1 className="rc-display mt-4 max-w-3xl text-[--color-rc-text]">
            {copy.landing.heroTitle}
          </h1>
          <p className="mt-5 max-w-2xl text-[--text-rc-lg] leading-relaxed text-[--color-rc-text-muted]">
            {copy.landing.heroSubtitle}
          </p>
        </div>
      </header>

      {/* Secondary CTA band — single CTA, points at the first package. Falls
          back to the empty-state subtitle when the catalog is empty. */}
      <section className="border-b border-[--color-rc-border] bg-[--color-rc-surface]">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <p className="text-[--text-rc-sm] text-[--color-rc-text-muted]">
            {firstPackage
              ? `Try the first decision: ${firstPackage.title}.`
              : copy.emptyStates.emptyCatalog.body}
          </p>
          {firstPackage ? (
            <a
              href={`/packages/${firstPackage.slug}`}
              className={
                "inline-flex w-fit items-center gap-1.5 rounded-[--radius-rc-md] " +
                "bg-[--color-rc-accent] px-3.5 py-2 text-[--text-rc-sm] font-semibold " +
                "text-[--color-rc-on-accent] transition-colors duration-[--duration-rc-fast] " +
                "hover:bg-[--color-rc-accent-hover]"
              }
            >
              <span>Try the first research decision</span>
              <span aria-hidden>→</span>
            </a>
          ) : null}
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1280px] px-6 py-10 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[--text-rc-xl] font-semibold text-[--color-rc-text]">
              Catalog
            </h2>
            <p className="text-[--text-rc-sm] text-[--color-rc-text-muted]">
              {packages.length === 1
                ? "One package, fully tested end-to-end."
                : `${packages.length} packages available.`}
            </p>
          </div>
          <CatalogFilters className="hidden md:flex" />
        </div>

        {packages.length === 0 ? (
          <EmptyState
            title={copy.emptyStates.emptyCatalog.title}
            body={copy.emptyStates.emptyCatalog.body}
          />
        ) : (
          <ul
            className={
              "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            }
          >
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
