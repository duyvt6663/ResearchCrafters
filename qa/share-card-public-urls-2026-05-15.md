# QA: share-card public URLs + image assets

- **Backlog item:** `backlog/01-mvp-platform.md:141` — Generate real share-card
  public URLs and image assets.
- **Date:** 2026-05-15
- **Branch:** `skynet/post-qa-2026-05-15`

## Scope

Before this change, `/api/share-cards` already minted a `publicSlug` per row
and returned absolute URLs derived by
`apps/web/lib/share-card-urls.ts`:

- `<PUBLIC_APP_URL>/s/<publicSlug>` — public landing page.
- `<PUBLIC_APP_URL>/api/share-cards/<id>/image.svg?s=<publicSlug>` — image
  asset.

The image asset route existed; the public landing route did **not**. The
URL builder advertised `/s/<slug>` but no page handler resolved it, so
every published link 404'd on Next's default not-found.

This iteration:

1. Adds `getShareCardByPublicSlug(slug)` to
   `apps/web/lib/data/share-cards.ts` so non-route surfaces can resolve a
   card by its slug without re-implementing the Prisma query.
2. Adds `apps/web/app/s/[slug]/page.tsx`: a server component that resolves
   the card by `publicSlug`, calls `notFound()` when the slug is unknown or
   the card has been unshared (`publicSlug === null`), and renders
   `<ShareCardPreview payload={…} />` from `@researchcrafters/ui`.
3. Adds `generateMetadata()` to the same page so OpenGraph + Twitter
   social-card crawlers point at the absolute image URL via
   `buildShareCardImageUrl(id, slug)` — re-using the same env-var → URL
   helper the publish route already returns to clients, so the image URL
   advertised in the JSON response is byte-identical to the URL crawlers
   resolve.
4. Adds vitest coverage for the URL helpers, the image route, the public
   landing resolver, and the metadata.

The renderer in `apps/web/lib/share-card-svg.ts` is unchanged — it already
emits a self-contained 1200×630 SVG with no external assets so the social
image preview renders the same in a browser, an OG crawler, and a
screenshot test.

## Files changed

- `apps/web/lib/data/share-cards.ts` — added `getShareCardByPublicSlug`.
- `apps/web/app/s/[slug]/page.tsx` — new public landing route +
  `generateMetadata`.
- `apps/web/vitest.config.ts` — picks up `.test.tsx` so the new
  metadata/render test runs.
- `apps/web/lib/__tests__/share-card-urls.test.ts` — pins the env-var
  fallback chain + URL encoding for the slug + id.
- `apps/web/lib/__tests__/route-share-card-image.test.ts` — pins the
  image-route behaviour (404 on missing/unshared/slug-mismatch, SVG +
  cache headers on the happy path).
- `apps/web/lib/__tests__/route-public-share-page.test.tsx` — pins the
  resolver + metadata behaviour. The JSX-render path is not covered at
  the unit level (the apps/web vitest setup uses the Node environment
  without `@vitejs/plugin-react`, so JSX construction throws
  `React is not defined`). The two `notFound()` branches are exercised
  fully because they short-circuit before the JSX node is constructed.

## Verification

- `cd apps/web && npx vitest run`
  → `Test Files 33 passed | 1 skipped (34)`,
  `Tests 241 passed | 9 skipped (250)`.
- `cd apps/web && npx vitest run lib/__tests__/share-card-urls.test.ts
  lib/__tests__/route-share-card-image.test.ts
  lib/__tests__/route-share-cards.test.ts
  lib/__tests__/route-public-share-page.test.tsx`
  → 27 / 27 passing across the new + adjacent files.
- `cd apps/web && npx tsc --noEmit`
  → the only diagnostics are pre-existing (verified by stashing this
  patch and re-running): `@prisma/client` module resolution + the
  `share_card_unshared` telemetry-event type. Neither is touched by
  this change.

## Privacy / suppression notes

- The page does not surface fields beyond what
  `apps/web/lib/share-cards.ts:buildShareCardPayload` already snapshotted
  on publish. Cohort percentage stays suppressed via
  `safeCohortPercentage` (no path on this page bypasses it).
- Unshared cards (`publicSlug` cleared by
  `revokeShareCardPublicSlug`) return 404 from both the landing page and
  the image asset, so a leaked URL stops resolving immediately.
- `generateMetadata` only emits OpenGraph data for cards with a current
  `publicSlug`; unshared cards fall back to a generic title with no
  image attachment, so social previews can't continue to show a
  previously-published preview.

## Follow-ups (not required for this bullet)

- PNG/JPEG asset (vs the current self-contained SVG) — already tracked
  in `apps/worker/src/jobs/share-card-render.ts` with a
  `TODO(share-card-render)`.
- React-render unit coverage for the page body once vitest + a React
  plugin are wired into `apps/web` (separate scaffolding bullet).
