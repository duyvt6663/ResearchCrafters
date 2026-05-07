import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import {
  DecisionChoiceList,
  PackageOverview,
  StatusBadge,
} from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import { getPackageBySlug } from "@/lib/data/packages";
import { track } from "@/lib/telemetry";

type Params = { slug: string };

/**
 * Opt out of static prerender: this page resolves the package by slug through
 * `getPackageBySlug`, which is backed by Prisma. Building statically would try
 * to run the query without a `DATABASE_URL`; force-dynamic defers it to
 * request time.
 */
export const dynamic = "force-dynamic";

export default async function PackageOverviewPage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const pkg = await getPackageBySlug(slug);
  if (!pkg) notFound();

  await track("package_viewed", { surface: "overview", slug });

  return (
    <main className="rc-page rc-page--package-overview">
      <PackageOverview
        title={pkg.title}
        paperTitle={pkg.paperTitle}
        oneLinePromise={pkg.oneLinePromise}
        skills={pkg.skills}
        prerequisites={pkg.prerequisites}
        difficulty={pkg.difficulty}
        estimatedMinutes={pkg.estimatedMinutes}
        freeStageCount={pkg.freeStageCount}
        releaseStatus={pkg.releaseStatus}
        whatYouWillPractice={pkg.whatYouWillPractice}
        stages={pkg.stages}
        ctaLabel={copy.packageOverview.startCta}
        ctaHref={`/packages/${pkg.slug}/start`}
      />

      <section className="rc-band rc-band--graph-preview">
        <h2>{copy.packageOverview.graphPreviewTitle}</h2>
        <p>{copy.packageOverview.graphPreviewBody}</p>
        {/* Decision graph preview placeholder. The real React Flow graph lives
            in @researchcrafters/ui and consumes the /api/enrollments/:id/graph
            payload once the user enrolls. */}
        <div className="rc-graph-placeholder" aria-label="decision graph preview" />
      </section>

      <section className="rc-band rc-band--sample-decision">
        <h2>{copy.packageOverview.sampleDecisionTitle}</h2>
        <p className="rc-prompt">{pkg.sampleDecision.prompt}</p>
        <DecisionChoiceList
          choices={pkg.sampleDecision.branches.map((b, idx) => ({
            id: `sample-${idx}`,
            label: b.label,
            summary: b.summary,
            // Sample decisions on the marketing surface only show canonical and
            // suboptimal branches — failed branches stay hidden so the public
            // page does not leak the full graph.
            revealed: b.revealed && b.type !== "failed",
            type: b.type,
          }))}
          readOnly
        />
      </section>

      <section className="rc-band rc-band--failed-branch">
        <h2>{pkg.failedBranchLesson.title}</h2>
        <p>{pkg.failedBranchLesson.redactedSummary}</p>
      </section>

      <section className="rc-band rc-band--evidence">
        <h2>{copy.packageOverview.evidenceTitle}</h2>
        <figure>
          <div className="rc-artifact-preview" data-kind={pkg.sampleArtifact.kind} />
          <figcaption>{pkg.sampleArtifact.caption}</figcaption>
        </figure>
      </section>

      <section className="rc-band rc-band--pricing">
        <StatusBadge tone="info">
          {pkg.pricing.cta === "buy"
            ? copy.packageOverview.priceCta(pkg.pricing.monthlyUsd ?? 0)
            : copy.packageOverview.waitlistCta}
        </StatusBadge>
      </section>
    </main>
  );
}
