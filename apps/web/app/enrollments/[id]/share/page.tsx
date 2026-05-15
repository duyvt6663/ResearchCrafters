import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { ShareCardPreview } from "@researchcrafters/ui/components";
import { copy } from "@researchcrafters/ui/copy";
import { getEnrollment } from "@/lib/data/enrollment";
import { getPackageBySlug } from "@/lib/data/packages";
import { buildShareCardPayload } from "@/lib/share-cards";

type Params = { id: string };

/**
 * Opt out of static prerender: this page reads enrollment + package rows from
 * Prisma. Static prerender would try to query the DB at build time without a
 * `DATABASE_URL`; force-dynamic defers it to request time.
 */
export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { id } = await params;
  const enrollment = await getEnrollment(id);
  if (!enrollment) notFound();
  const pkg = await getPackageBySlug(enrollment.packageSlug);
  if (!pkg) notFound();

  // Snapshot payload that will eventually be persisted as an immutable
  // share-card row per backlog/06. Cohort percentage stays suppressed until
  // persisted `node_traversals` allow the minimum-N rule to run.
  const payload = buildShareCardPayload({
    enrollment: {
      packageSlug: pkg.slug,
      packageVersionId: enrollment.packageVersionId,
      completedStageRefs: enrollment.completedStageRefs,
    },
    pkg: { stages: pkg.stages, sampleDecision: pkg.sampleDecision },
    insight: "",
    selectedBranchType: "canonical",
    cohortPercentage: null,
  });

  return (
    <main className="rc-page rc-page--share">
      <header className="relative overflow-hidden border-b border-(--color-rc-border) bg-(--color-rc-surface)">
        <div className="rc-hero-grid absolute inset-0 opacity-50" aria-hidden />
        <div className="relative mx-auto w-full max-w-[1280px] px-6 py-14 lg:px-8 lg:py-16">
          <span className="rc-eyebrow">Share card</span>
          <h1 className="rc-display mt-3 max-w-3xl text-(--color-rc-text)">
            {copy.share.captureTitle}
          </h1>
          <p className="mt-4 max-w-2xl text-(--text-rc-md) leading-[1.6] text-(--color-rc-text-muted)">
            {copy.share.captureBody}
          </p>
        </div>
      </header>

      <section className="mx-auto w-full max-w-[1280px] px-6 py-12 lg:px-8">
        <ShareCardPreview
          payload={payload}
          captureLabel={copy.share.insightLabel}
          publishLabel={copy.share.publishCta}
          unshareLabel={copy.share.unshareCta}
          publishHref="/api/share-cards"
        />
      </section>
    </main>
  );
}
