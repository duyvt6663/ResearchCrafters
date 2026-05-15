import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { ShareCardPreview } from "@researchcrafters/ui/components";
import type { ShareCardPayload } from "@researchcrafters/ui/components";
import { getShareCardByPublicSlug } from "@/lib/data/share-cards";
import { buildShareCardImageUrl } from "@/lib/share-card-urls";

type Params = { slug: string };

/**
 * The public landing route reads from the DB at request time. Static
 * prerender would try to query Prisma at build time without a
 * `DATABASE_URL`; force-dynamic defers it to request time.
 */
export const dynamic = "force-dynamic";

/**
 * OpenGraph metadata for `/s/<publicSlug>`.
 *
 * Social-card crawlers (Twitter/X, Slack, iMessage, LinkedIn) need an
 * absolute image URL — they don't follow relative paths from the page HTML.
 * `buildShareCardImageUrl` honours `PUBLIC_APP_URL` so the same value the
 * publish route returned to the client is the one we advertise to crawlers.
 *
 * Cards that have been unshared (slug cleared) return `notFound()` from
 * the page itself; we still emit a generic title here so the metadata
 * function doesn't throw before the page can handle the miss.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const card = await getShareCardByPublicSlug(slug);
  if (!card || card.publicSlug == null) {
    return { title: "ResearchCrafters · Share card" };
  }
  const payload = card.payload as ShareCardPayload;
  const pkgSlug = payload.packageSlug ?? "run";
  const title = `ResearchCrafters · ${pkgSlug}`;
  const description =
    payload.learnerInsight && payload.learnerInsight.length > 0
      ? payload.learnerInsight.slice(0, 280)
      : "A run on ResearchCrafters — rebuild the research behind famous AI papers.";
  const imageUrl = buildShareCardImageUrl(card.id, card.publicSlug);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function PublicShareCardPage({
  params,
}: {
  params: Promise<Params>;
}): Promise<ReactElement> {
  const { slug } = await params;
  const card = await getShareCardByPublicSlug(slug);
  if (!card || card.publicSlug == null) notFound();
  const payload = card.payload as ShareCardPayload;
  return (
    <main className="rc-page rc-page--share-public mx-auto w-full max-w-[1280px] px-6 py-12 lg:px-8">
      <header className="mb-8">
        <span className="rc-eyebrow">Shared run</span>
        <h1 className="rc-display mt-3 text-(--color-rc-text)">
          {payload.packageSlug ?? "Run summary"}
        </h1>
        <p className="mt-3 text-(--text-rc-sm) text-(--color-rc-text-muted)">
          A snapshot from a learner on ResearchCrafters.
        </p>
      </header>
      <ShareCardPreview payload={payload} />
    </main>
  );
}
