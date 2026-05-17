# QA — Flagship package landing page

- **Backlog item:** `85f86da0-e439-4e90-bf10-84bb721220a9` — "Create one flagship
  package landing page." from `backlog/07-alpha-launch.md:19` (§ Pre-Launch Assets).
- **Branch:** `skynet/pr/flagship-package-landing-page-2026-05-17`
- **Date:** 2026-05-17

## Scope

Added a marketing landing page for the ResNet flagship package at `/flagship`.
The page is intentionally static (no Prisma, no `force-dynamic`) so it builds
without `DATABASE_URL` and can be cached at the edge.

The new route is a top-of-funnel surface separate from:

- `/` — the catalog (multi-package).
- `/packages/[slug]` — the in-app overview / enrollment surface, which still
  owns auth, paywall, and enrollment flows.

The page links into both. The primary CTA points at `/packages/resnet`; the
secondary CTA points at the catalog `/`. No new API surface or data model
changes were introduced.

### Files added

- `apps/web/app/flagship/page.tsx` — the marketing page (hero, puzzle,
  outcomes, stage roadmap, footer CTA).
- `apps/web/lib/__tests__/route-flagship-landing.test.tsx` — render smoke
  test + redaction-safety assertions.

## Verification

Commands run inside the worktree at `.skynet-wt/flagship-landing/apps/web`:

```
pnpm vitest run lib/__tests__/route-flagship-landing.test.tsx
```

Result: ✅ 3/3 tests pass.

- `exposes a marketing-safe page title and OG description` — passes.
- `renders the hero, puzzle, stage list and a start-CTA pointing at the flagship package` — passes; asserts both hero and footer CTAs point at `/packages/resnet` and the secondary CTA points at `/`.
- `does not leak canonical-answer redaction targets` — passes; verifies the rendered HTML does not contain the phrases listed in `content/packages/resnet/package.yaml § safety.redaction_targets` (`F(x) + x`, `identity shortcut`, `residual mapping`, `shortcut connection`).

```
pnpm tsc --noEmit
```

No new type errors introduced by the landing page or its test. The pre-existing
errors in `app/api/stage-attempts/route.ts`, `app/api/submissions/route.ts`, and
`lib/grading/grade-override.ts` reference symbols not yet exported from
`@researchcrafters/db` on `origin/main` and are unrelated to this change
(`pnpm tsc --noEmit 2>&1 | grep flagship` returns empty).

## Safety / contracts

- The page does not import `@researchcrafters/db`, the Prisma client, or any
  authenticated session helper, so it stays renderable for anonymous visitors
  and at build time without `DATABASE_URL`.
- Marketing copy was reviewed against `content/packages/resnet/package.yaml §
  safety.redaction_targets`. The test enforces the same set so future copy
  edits cannot regress.
- The stage roadmap is hard-coded from the current curriculum
  (`content/packages/resnet/curriculum/stages`) instead of loading the manifest
  at request time. The trade-off is intentional: marketing pages favour edge
  cacheability, and this QA report is the canary if the curriculum drifts.

## Residual risks

- **Curriculum drift.** If the resnet curriculum gains/loses stages or
  retitles them, the hand-authored `FLAGSHIP_STAGES` list goes stale. Watch
  for this when reviewing changes under
  `content/packages/resnet/curriculum/stages/*.yaml`.
- **No nav entry.** The page is not yet linked from `TopNav` in
  `apps/web/app/layout.tsx`. That is deliberate — the link target is set by
  the outbound campaign (e.g. share posts, Twitter bio) and adding it to the
  product nav would change the catalog's information architecture. A follow-up
  decision on whether to surface it in-product can be raised separately.
- **Founder pricing.** The page does not yet quote a price; the founder
  pricing offer is its own backlog item under § Pre-Launch Assets. Once that
  is decided, the footer CTA copy should be revisited.
