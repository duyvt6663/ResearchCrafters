# Share cards show hardest decision and safe branch percentages — QA — 2026-05-15

Scope: `backlog/00-roadmap.md:104` (Phase 3 acceptance bullet)
— "Share cards can show hardest decision and safe branch percentages."

Runner: `skynet-backlog-iterator` cron, claim
`25516ef5-87de-45b9-98fd-5f855136aa94`.

Environment:
- node v25.8.1, pnpm 9.12.0
- Workspace: `/Users/duyvt6663/github/ResearchCrafters`
- Branch: `duykhanh/add-more-code-3`

## What this iteration verified

The pipeline that lets a share card display these two fields was already in
place from the earlier share-card payload generation work
(`qa/share-card-payload-2026-05-15.md`):

- `apps/web/lib/share-cards.ts` :: `buildShareCardPayload` accepts and
  threads `hardestDecision` (with `pkg.sampleDecision.prompt` fallback) and
  `cohortPercentage` (treated as already minimum-N-suppressed per
  `backlog/06` Branch Stats and Privacy).
- `apps/web/app/api/share-cards/route.ts` accepts a caller-supplied
  `hardestDecision`, validates branch type, and emits a payload that carries
  both fields. The route still passes `cohortPercentage: null` because
  live cohort data is blocked on persisted `node_traversals` (tracked under
  `backlog/06`); the type and UI plumbing it needs are already shipped.
- `packages/ui/src/components/ShareCardPreview.tsx` renders the
  "Hardest decision" row when `payload.hardestDecision` is set, and renders
  `${Math.round(cohortPercentage)}%` when the payload supplies a non-null
  cohort value. When the payload marks the cohort `null` (suppressed below
  minimum-N) the component swaps in the authored `rareBranch()` copy via
  `packages/ui/src/copy/branch-suppression.ts`.

The gap this iteration closed was test coverage proving the rendering and
passthrough work end-to-end for the acceptance criterion.

## New / updated tests

- `packages/ui/test/share-card-preview.test.tsx` (new, 5 SSR tests) —
  pins:
  - hardest-decision copy renders when supplied,
  - cohort percentage renders rounded when a number is supplied (62.7 → 63%),
  - cohort row collapses to suppression copy and emits no `%` when
    `cohortPercentage === null`,
  - hardest-decision row is omitted when not supplied,
  - both fields can render together on the same card.
- `apps/web/lib/__tests__/share-cards.test.ts` (extended) — added the
  `passes a caller-supplied cohort percentage through verbatim` case so
  `buildShareCardPayload` no longer only tests the suppressed default.

## Commands run

- `pnpm --filter @researchcrafters/web exec vitest run
   lib/__tests__/share-cards.test.ts lib/__tests__/route-share-cards.test.ts`
  → PASS (20/20; share-cards 11, route 9).
- `pnpm --filter @researchcrafters/ui exec vitest run
   test/share-card-preview.test.tsx` → PASS (5/5).
- `pnpm --filter @researchcrafters/ui test` → PASS (78/78 across 16 files,
  +5 vs the prior 73 baseline).
- `pnpm --filter @researchcrafters/web run typecheck` → PASS.
- `pnpm --filter @researchcrafters/ui run typecheck` → PASS.

## Remaining risks / out of scope

- Live cohort numbers are still suppressed in production because
  `node_traversals` are not yet persisted. Tracked under `backlog/06`
  "Branch Stats and Privacy" and the Phase 3 "Add `branch_stats` rollups
  with minimum-N suppression" bullet. The UI is ready for that data the
  moment the route can pass a non-null number.
- Durable share-card row write is still a stub
  (`backlog/06` Share Cards bullet 1). Not in scope for this acceptance
  criterion, which is about display capability.
