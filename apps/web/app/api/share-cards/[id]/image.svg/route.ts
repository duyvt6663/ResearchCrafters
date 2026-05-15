import { NextResponse } from "next/server";
import { getShareCardById } from "@/lib/data/share-cards";
import { renderShareCardSvg } from "@/lib/share-card-svg";
import type { ShareCardPayload } from "@researchcrafters/ui/components";

export const runtime = "nodejs";

type RouteParams = { id: string };

/**
 * Public image asset for a published share card.
 *
 * Resolves only while the card has a `publicSlug`; unshared cards return
 * 404 so the asset URL stops working immediately after revoke. The optional
 * `?s=<slug>` query param lets callers (e.g. social-card crawlers cached
 * with the previous slug) detect a stale URL — if the slug doesn't match
 * the row's current slug we 404 as well.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<RouteParams> },
): Promise<NextResponse | Response> {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const card = await getShareCardById(id);
  if (!card || card.publicSlug == null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const requestedSlug = url.searchParams.get("s");
  if (requestedSlug !== null && requestedSlug !== card.publicSlug) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const svg = renderShareCardSvg(card.payload as ShareCardPayload);
  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
