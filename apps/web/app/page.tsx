import type { ReactElement } from "react";
import { CatalogFilters, EmptyState, PackageCard } from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import { listPackages } from "@/lib/data/packages";
import { track } from "@/lib/telemetry";

export default async function CatalogPage(): Promise<ReactElement> {
  const packages = await listPackages();

  // Catalog view is the primary marketing surface; record the visit.
  await track("package_viewed", { surface: "catalog", count: packages.length });

  return (
    <main className="rc-page rc-page--catalog">
      <header className="rc-band rc-band--hero">
        <h1>{copy.landing.heroTitle}</h1>
        <p>{copy.landing.heroSubtitle}</p>
      </header>

      <section className="rc-band">
        <CatalogFilters />
      </section>

      <section className="rc-band rc-band--catalog">
        {packages.length === 0 ? (
          <EmptyState
            title={copy.emptyStates.emptyCatalog.title}
            body={copy.emptyStates.emptyCatalog.body}
          />
        ) : (
          <ul className="rc-grid rc-grid--cards">
            {packages.map((pkg) => (
              <li key={pkg.slug}>
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
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
