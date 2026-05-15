// Public URL + image-asset URL derivation for share cards.
//
// The web app exposes:
//   - `<PUBLIC_APP_URL>/s/<publicSlug>`               — public landing URL
//   - `<PUBLIC_APP_URL>/api/share-cards/<id>/image.svg` — image asset
//
// Both URLs only resolve to something useful while the row has a
// `publicSlug`. Unsharing clears that slug so the public landing 404s and
// the image route refuses to render.

const DEFAULT_PUBLIC_BASE = "http://localhost:3000";

function readPublicBase(): string {
  const raw =
    process.env["PUBLIC_APP_URL"] ??
    process.env["NEXT_PUBLIC_APP_URL"] ??
    DEFAULT_PUBLIC_BASE;
  return raw.replace(/\/+$/, "");
}

export function buildShareCardPublicUrl(publicSlug: string): string {
  return `${readPublicBase()}/s/${publicSlug}`;
}

export function buildShareCardImageUrl(
  shareCardId: string,
  publicSlug: string,
): string {
  // The slug is included as a query param so unshared cards (slug cleared)
  // can be detected by the image route and 404, even if the id is still
  // known to a stale caller.
  return `${readPublicBase()}/api/share-cards/${encodeURIComponent(
    shareCardId,
  )}/image.svg?s=${encodeURIComponent(publicSlug)}`;
}
