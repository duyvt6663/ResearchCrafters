# QA — Share Card cohort percentage minimum-N suppression

- Backlog item: `backlog/06-data-access-analytics.md:154` — "Include cohort
  selection percentage only after minimum-N suppression passes."
- Workflow item id: `16cf074e-1b6a-4fb8-90cb-277cdc6434cd`
- Date: 2026-05-17

## Scope tested

Verified the share-card payload only surfaces a cohort selection percentage
when the underlying sample clears the privacy thresholds, and that the same
threshold pair the worker rollup uses is enforced at the web boundary so a
misbehaving caller cannot leak a low-N number.

Files inspected:

- `apps/web/lib/share-cards.ts` — `safeCohortPercentage`,
  `deriveCohortPercentage`, `buildShareCardPayload`,
  `SHARE_CARD_NODE_MIN_N`, `SHARE_CARD_BRANCH_MIN_N`.
- `apps/web/app/api/share-cards/route.ts` — confirms route currently passes
  `cohortPercentage: null` (suppressed by default) pending the
  `node_traversals` persistence work tracked at lines 159 / 177.
- `apps/web/lib/__tests__/share-cards.test.ts` — covers threshold edges,
  degenerate samples, sample-vs-percentage precedence, and 5% bucketing.

## Behaviour confirmed

- `safeCohortPercentage` returns `null` when `nodeN < 20` or
  `branchN < 5`, when `branchN < 0`, when `branchN > nodeN`, or when
  either input is `NaN` / `Infinity` / non-finite.
- On a valid sample it rounds to the nearest 5% (matches worker rollup
  bucketing) so the route, the preview, and the worker emit the same
  bucket.
- `buildShareCardPayload` treats `cohortSample` as authoritative: passing
  a low-N sample suppresses to `null` even when the caller also supplied
  `cohortPercentage: 80`. This is the leak path called out by
  `backlog/00-roadmap.md:105`.
- Route default keeps cohort suppressed (`cohortPercentage: null`) until
  `node_traversals` are persisted; that follow-on persistence work stays
  open under the separate items at lines 159 and 177.

## Commands run

```bash
cd apps/web && pnpm vitest run lib/__tests__/share-cards.test.ts
```

Result: 23 passed, 0 failed (duration ~565 ms).

## Result

PASS — minimum-N suppression is enforced at the single chokepoint used by
the share-card route, and tests pin both the thresholds (20 / 5) and the
sample-takes-precedence rule.

## Residual risks / follow-ups

- Cohort percentages are not yet *populated* end-to-end from real branch
  stats; the route still hard-codes `cohortPercentage: null`. Surfacing a
  live cohort number requires the persisted `node_traversals` +
  branch-stats rollup work tracked at `backlog/06-data-access-analytics.md`
  lines 159, 177, 180.
- Thresholds are duplicated between
  `apps/web/lib/share-cards.ts` and
  `apps/worker/src/jobs/branch-stats-rollup.ts`. Both sides have tests
  pinning the values; if they ever diverge, both test files fail loudly.
