# Branch-stats rollup job — build verification — QA — 2026-05-17

## Backlog item

- `backlog/06-data-access-analytics.md:180` — "Build the branch-stats rollup
  job (per-branch N>=5, per-node N>=20, 5% rounding)."

## Scope tested

Verification that the rollup build is feature-complete in the target repo
and matches the documented privacy/thresholding contract. The end-to-end
Redis execution path is out of scope and explicitly blocked by the
separate item `backlog/06-data-access-analytics.md:79`
("Persist `node_traversals` and `stage_attempts` from API routes…");
that dependency is intentionally not handled here.

Out of scope:
- `node_traversals` persistence from API routes (separate backlog item).
- Live Redis bring-up / runner-loop port retargeting (operational
  dependency called out in the original bullet).

## As-built summary

The rollup is wired end-to-end in code; the only remaining work is the
upstream `node_traversals` writer (tracked separately) and the
deployment-side Redis bring-up.

### 1. Pure job logic — `apps/worker/src/jobs/branch-stats-rollup.ts`

- `NODE_MIN_N = 20` and `BRANCH_MIN_N = 5` exported as constants so call
  sites and tests share the thresholds.
- `roundToNearestFive(percent)` — `Math.round(percent / 5) * 5`.
- `computePercent(branchN, nodeN)` returns `null` when either
  `nodeN < NODE_MIN_N`, `branchN < BRANCH_MIN_N`, or `nodeN === 0`;
  otherwise returns `roundToNearestFive((branchN / nodeN) * 100)`.
- `aggregateTraversals(rows)` ignores rows whose `branchId` is null,
  tallies per-node totals, and emits `{decisionNodeId, branchId,
  branchN, nodeN}` rows.
- `runBranchStatsRollup(job, prisma)` reads `node_traversals` for the
  rolling window + `packageVersionId`, calls `aggregateTraversals` and
  `computePercent`, and upserts a `branch_stat` row keyed on
  `(packageVersionId, decisionNodeId, branchId, cohort, windowStart)`.
  Rows below the suppression thresholds are persisted with `percent =
  null` so the public reader path can render "rare branch" copy without
  a re-query.
- `BranchStatsPrisma` is an explicit structural narrowing of the
  generated Prisma client so the unit tests can mock without the full
  client surface.

### 2. Scheduler — `apps/worker/src/scheduler.ts`

- `BRANCH_STATS_ROLLUP_CRON = '*/15 * * * *'` (every 15 minutes).
- `ROLLING_WINDOW_MS = 60 * 60 * 1000` (1-hour rolling window).
- `SCHEDULED_BRANCH_STATS_COHORTS = PUBLIC_COHORTS` from
  `@researchcrafters/telemetry`, so `alpha_beta` stays off the
  recurring schedule (admins backfill it via the admin trigger).
- `installSchedules(connection)` fans out one repeating job per
  `(packageVersionId, cohort)` with a stable `jobId =
  branch-stats-rollup:<packageVersionId>:<cohort>` so re-installs are
  idempotent — BullMQ deduplicates by `(name, jobId, repeat.pattern)`.
- `livePackageVersionsLookup` defaults to `['*']` so the scheduler boots
  without Postgres; a follow-up swap to a Prisma-backed lookup is
  trivial.
- Test seams: `_setQueueFactoryForTests`,
  `_setLivePackageVersionsLookupForTests`.

### 3. Worker consumer — `apps/worker/src/index.ts`

- `startAllWorkers()` mounts a BullMQ `Worker` per managed queue and
  routes `branch_stats_rollup` job payloads to `runBranchStatsRollup`
  bound to the singleton `prisma` from `@researchcrafters/db`.
- Schedules are installed before consumers so jobs that fire
  immediately have a worker to pick them up.
- `WORKER_SCHEDULES_ENABLED` flag (default-on outside tests) gates
  schedule installation; failures are logged via
  `{kind: 'worker_schedule_install_failed', error}` and do not crash
  the worker — this matches the original "Redis bring-up still
  in flight" note.

### 4. Admin trigger — `apps/web/app/api/admin/rollup-branch-stats/route.ts`

- POST with `{packageVersionId, cohort, windowStart, windowEnd}`.
- `getSessionFromRequest` enforces auth; `ADMIN_EMAILS` env allowlist
  enforces admin scope.
- `isCohort(cohort)` validates against the typed `COHORTS` source of
  truth. Returns `{error: 'invalid_cohort', validCohorts: [...COHORTS]}`
  on mismatch — admins may pass `alpha_beta` (the recurring schedule
  excludes it; admin backfill does not).
- Enqueues onto `BRANCH_STATS_ROLLUP_QUEUE` via the producer-side
  `getProducerQueue` helper.

## Commands run

- `pnpm --filter @researchcrafters/worker exec vitest run
   test/branch-stats.test.ts test/branch-stats-thresholds.test.ts
   test/scheduler.test.ts` — **17 passed** (8 + 6 + 3).
- `pnpm --filter @researchcrafters/worker typecheck` — clean.

## Test coverage map

| Concern                                       | Covered by                                |
|-----------------------------------------------|-------------------------------------------|
| Half-way rounding to nearest 5                | `branch-stats.test.ts` — `roundToNearestFive` |
| Node-min suppression (`nodeN < 20`)           | `branch-stats.test.ts`, `branch-stats-thresholds.test.ts` |
| Branch-min suppression (`branchN < 5`)        | `branch-stats.test.ts`, `branch-stats-thresholds.test.ts` |
| Inclusive threshold boundary (N=20, branchN=5)| `branch-stats-thresholds.test.ts` |
| Off-by-one suppress (N=19, branchN=4)         | `branch-stats-thresholds.test.ts` |
| Division-by-zero guard (`nodeN === 0`)        | `branch-stats-thresholds.test.ts` |
| 100% case (branchN == nodeN ≥ 20)             | `branch-stats-thresholds.test.ts` |
| Aggregation ignores null `branchId`           | `branch-stats.test.ts` — `aggregateTraversals` |
| Suppressed rows are still persisted (n, null) | `branch-stats.test.ts` — `runBranchStatsRollup` |
| Idempotent upsert via `findFirst` + update    | `branch-stats.test.ts` — `runBranchStatsRollup` |
| Repeating job per cohort, 1h rolling window   | `scheduler.test.ts` — `installSchedules` |
| Stable `jobId` per (packageVersionId, cohort) | `scheduler.test.ts` — `installSchedules` |
| Re-install is idempotent (no duplicate keys)  | `scheduler.test.ts` |

## Result

PASS. The build matches the bullet's contract (per-branch N≥5,
per-node N≥20, 5% rounding) and the surrounding privacy policy
(alpha_beta excluded from the recurring schedule via `PUBLIC_COHORTS`).
Tests and typecheck are green.

## Residual risks / follow-ups (tracked separately)

- `node_traversals` are not yet persisted from API routes — without
  rows, the rollup runs against an empty set and writes nothing. This
  is the live blocker on real signal; it remains a separate backlog
  item (`backlog/06-data-access-analytics.md:79`).
- Local Redis bring-up / runner-loop port retargeting is a deployment
  concern, not a build concern; the worker degrades gracefully when
  `installSchedules` throws.
- `livePackageVersionsLookup` still returns the sentinel `['*']`;
  swapping it for a Prisma query against `package_versions WHERE
  status = 'live'` is a small follow-up but not blocking the build.
