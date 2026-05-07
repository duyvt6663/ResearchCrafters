import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import {
  Card,
  CardBody,
  CardHeader,
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

      <div className="mx-auto w-full max-w-[1280px] px-6 pb-16 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
          <div className="flex flex-col gap-8">
            {/* Sample decision — rendered as a read-only DecisionChoiceList
                inside a card so the section reads as a bounded artifact. */}
            <section>
              <header className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[--text-rc-md] font-semibold text-[--color-rc-text]">
                  {copy.packageOverview.sampleDecisionTitle}
                </h2>
                <span className="text-[--text-rc-xs] text-[--color-rc-text-subtle]">
                  Read-only preview
                </span>
              </header>
              <Card>
                <CardBody className="flex flex-col gap-4 p-5">
                  <p className="text-[--text-rc-sm] leading-relaxed text-[--color-rc-text]">
                    {pkg.sampleDecision.prompt}
                  </p>
                  <DecisionChoiceList
                    choices={pkg.sampleDecision.branches.map((b, idx) => ({
                      id: `sample-${idx}`,
                      label: b.label,
                      summary: b.summary,
                      // Sample decisions on the marketing surface only show
                      // canonical and suboptimal branches — failed branches
                      // stay hidden so the public page does not leak the full
                      // graph.
                      revealed: b.revealed && b.type !== "failed",
                      type: b.type,
                    }))}
                    readOnly
                  />
                </CardBody>
              </Card>
            </section>

            {/* Failed-branch lesson — calm warning callout per FRONTEND.md
                §11/§16 (failure surfaces use the warning-subtle palette so
                they read as expected feedback, not as an error). */}
            <section
              className={
                "flex flex-col gap-2 rounded-[--radius-rc-md] " +
                "border border-[--color-rc-warning]/30 bg-[--color-rc-warning-subtle] " +
                "px-5 py-5"
              }
            >
              <span className="font-[--font-rc-mono] text-[--text-rc-xs] uppercase tracking-wide text-[--color-rc-warning]">
                Failed-branch lesson
              </span>
              <h2 className="text-[--text-rc-md] font-semibold text-[--color-rc-text]">
                {pkg.failedBranchLesson.title}
              </h2>
              <p className="text-[--text-rc-sm] leading-relaxed text-[--color-rc-text-muted]">
                {pkg.failedBranchLesson.redactedSummary}
              </p>
            </section>
          </div>

          <aside className="flex flex-col gap-6">
            {/* Decision graph preview placeholder. The real React Flow graph
                lives in @researchcrafters/ui and consumes the
                /api/enrollments/:id/graph payload once the user enrolls. */}
            <section>
              <header className="mb-3">
                <h2 className="text-[--text-rc-md] font-semibold text-[--color-rc-text]">
                  {copy.packageOverview.graphPreviewTitle}
                </h2>
                <p className="text-[--text-rc-xs] text-[--color-rc-text-muted]">
                  {copy.packageOverview.graphPreviewBody}
                </p>
              </header>
              <Card>
                <CardBody className="p-0">
                  <div
                    className={
                      "rc-graph-placeholder aspect-[4/3] w-full rounded-b-[--radius-rc-lg] " +
                      "bg-[--color-rc-surface-muted]"
                    }
                    aria-label="decision graph preview"
                  />
                </CardBody>
              </Card>
            </section>

            <section>
              <header className="mb-3">
                <h2 className="text-[--text-rc-md] font-semibold text-[--color-rc-text]">
                  {copy.packageOverview.evidenceTitle}
                </h2>
              </header>
              <Card>
                <CardBody className="flex flex-col gap-3 p-5">
                  <div
                    className="rc-artifact-preview aspect-[16/9] w-full rounded-[--radius-rc-sm] bg-[--color-rc-surface-muted]"
                    data-kind={pkg.sampleArtifact.kind}
                  />
                  <p className="text-[--text-rc-xs] leading-relaxed text-[--color-rc-text-muted]">
                    {pkg.sampleArtifact.caption}
                  </p>
                </CardBody>
              </Card>
            </section>

            <section>
              <Card>
                <CardHeader>
                  <h2 className="text-[--text-rc-md] font-semibold text-[--color-rc-text]">
                    Pricing
                  </h2>
                </CardHeader>
                <CardBody className="p-5">
                  <StatusBadge tone="info">
                    {pkg.pricing.cta === "buy"
                      ? copy.packageOverview.priceCta(pkg.pricing.monthlyUsd ?? 0)
                      : copy.packageOverview.waitlistCta}
                  </StatusBadge>
                </CardBody>
              </Card>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
