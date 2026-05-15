# Share results without leaking low-N cohort data — QA — 2026-05-15

Scope: `backlog/00-roadmap.md:105` — Phase 3 acceptance bullet
"Users can share results without leaking low-N cohort data."

Runner: `skynet-backlog-iterator` cron, claim
`1fe21987-6f09-4e3e-a04b-dd414447d63d`.

Environment:
- node v25.8.1, pnpm 9.12.0
- Workspace: `/Users/duyvt6663/github/ResearchCrafters`
- Branch: `duykhanh/add-more-code-3`

## What was already in place

The cohort-suppression pipeline was partly built across the earlier share-card
work:

- Worker rollup `apps/worker/src/jobs/branch-stats-rollup.ts` :: `computePercent`
  enforces `NODE_MIN_N=20` / `BRANCH_MIN_N=5` before persisting any percent;
  rows below threshold are stored with `percent = null`.
- UI `packages/ui/src/components/ShareCardPreview.tsx` collapses a `null`
  cohort to the authored `rareBranch()` copy in
  `packages/ui/src/copy/branch-suppression.ts` ("Cohort data hidden").
- Route `apps/web/app/api/share-cards/route.ts` and share page
  `apps/web/app/enrollments/[id]/share/page.tsx` both hardcode
  `cohortPercentage: null` while persisted `node_traversals` are pending,
  so production never emits a number today.

The gap: `apps/web/lib/share-cards.ts` :: `buildShareCardPayload` trusted
callers to pre-suppress — only a comment, no enforcement. Once
`node_traversals` land and callers begin passing raw numbers, a misbehaving
caller (or a future code path that forgot the rule) could leak a low-N
percentage. That is the exact failure mode this acceptance bullet rules out.

## Change summary

Added a defense-in-depth chokepoint at the helper layer.

- New exports in `apps/web/lib/share-cards.ts`:
  - `SHARE_CARD_NODE_MIN_N = 20`, `SHARE_CARD_BRANCH_MIN_N = 5` — pinned
    by a test that asserts they match the worker rollup constants so the
    two cannot silently drift.
  - `safeCohortPercentage({ nodeN, branchN })` — returns the rounded-to-5%
    cohort percentage when both N values clear the thresholds, otherwise
    `null`. Mirrors the bucketing the worker writes into `branch_stats` so
    every surface shows the same number.
  - `CohortSample` type.
- `BuildShareCardPayloadInput` now accepts `cohortSample?: CohortSample`.
  When supplied it is authoritative: the payload's `cohortPercentage` is
  derived via `safeCohortPercentage`, so even a misbehaving caller that
  also passes `cohortPercentage` cannot leak a low-N number.
- `cohortPercentage` is now also defensively `null`-coerced when it is not
  a finite number (NaN/Infinity).

No call sites needed changes: the route + share page still pass
`cohortPercentage: null` and produce the same output. The new contract is
forward-compatible — once persisted `node_traversals` arrive, the route can
pass `cohortSample: { nodeN, branchN }` instead of pre-deriving a number,
and the helper guarantees suppression regardless of which path is taken.

## Acceptance bullets

- [x] Users can share results without leaking low-N cohort data.
      _(Helper now enforces `NODE_MIN_N` / `BRANCH_MIN_N` independently of
      callers; route + share page still pass `null`; UI surfaces
      `rareBranch()` copy. Worker `computePercent` already suppressed at
      write time. The system is now belt-and-braces: even a future caller
      that ignores the convention cannot emit a low-N percentage through
      `buildShareCardPayload`.)_

## New / updated tests

- `apps/web/lib/__tests__/share-cards.test.ts` (+13 tests, 23 total):
  - `safeCohortPercentage`: threshold-pinning vs worker constants, exact
    boundary `n=20 / b=5` publishes, `n=19` and `b=4` suppress, NaN /
    Infinity suppress, degenerate samples (`nodeN=0`, `branchN<0`,
    `branchN>nodeN`) suppress, rounding to nearest 5% matches worker.
  - `buildShareCardPayload` cohort leak prevention: sample above
    minimum-N derives a percentage; low node-N sample suppresses; low
    branch-N sample suppresses; **sample-is-authoritative regression** —
    when both `cohortPercentage=80` and a low-N `cohortSample={3,2}` are
    passed, the payload comes back `cohortPercentage: null`; non-finite
    `cohortPercentage` is coerced to `null` even with no sample.

## Commands run

- `pnpm --filter @researchcrafters/web exec vitest run
   lib/__tests__/share-cards.test.ts lib/__tests__/route-share-cards.test.ts`
  → PASS (32/32; share-cards 23, route 9).
- `pnpm --filter @researchcrafters/web run typecheck` → PASS.
- `pnpm --filter @researchcrafters/web test` → PASS
  (211 passed, 9 skipped, 28 files; +12 vs prior 199 baseline).

## Remaining risks / out of scope

- Live cohort numbers still wait on persisted `node_traversals`; the route
  continues to pass `cohortPercentage: null` until that lands (own backlog
  item under `backlog/06`). The new helper contract makes that future
  wiring safe by default.
- The `NODE_MIN_N` / `BRANCH_MIN_N` constants are duplicated in the worker
  package and the web package on purpose (keeps `@researchcrafters/web`
  free of the worker dependency). Drift is guarded by the new
  threshold-pinning test in `share-cards.test.ts` + the worker's existing
  `branch-stats-thresholds.test.ts`; a value change must update both.
