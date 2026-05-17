# Branch-stat cohort definitions and alpha_beta public exclusion — QA — 2026-05-17

## Backlog items

- `backlog/06-data-access-analytics.md:77` — Define cohorts: `all_attempts`,
  `completers`, `entitled_paid`, `alpha_beta`.
- `backlog/06-data-access-analytics.md:78` — Exclude `alpha_beta` from public
  percentages by default.

## Problem

The four cohort literals were referenced in four places with no shared source
of truth:

- `packages/telemetry/src/events.ts` exported a `Cohort` string-literal union
  with no semantics attached.
- `apps/worker/src/jobs/branch-stats-rollup.ts` declared its own
  `BranchStatsCohort` union.
- `apps/worker/src/scheduler.ts` declared a hand-rolled
  `SCHEDULED_BRANCH_STATS_COHORTS` tuple that excluded `alpha_beta` only by
  prose comment.
- `apps/web/app/api/admin/rollup-branch-stats/route.ts` declared a private
  `VALID_COHORTS` Set.
- `docs/TECHNICAL.md` and `packages/db/prisma/schema.prisma` carried prose
  descriptions of what each cohort means.

Nothing in code stated the membership rule for each cohort, and the
"`alpha_beta` excluded from public percentages by default" rule was an
informal scheduler comment rather than an enforceable property.

## Scope tested

- `packages/telemetry` build, typecheck, and unit tests.
- `apps/worker` typecheck and the affected unit tests
  (`test/scheduler.test.ts`, `test/branch-stats.test.ts`).
- `apps/web` typecheck filtered to the changed files
  (`app/api/admin/rollup-branch-stats/route.ts`, telemetry, scheduler, cohort
  references).

Out of scope: the `node_traversals` persistence and the end-to-end rollup,
which remain blocked under
`backlog/06-data-access-analytics.md:79` (separate backlog item).

## Change summary

- New module `packages/telemetry/src/cohorts.ts`:
  - `COHORTS` — canonical readonly tuple of the four cohort keys.
  - `Cohort` — type derived from `COHORTS`.
  - `COHORT_DEFINITIONS` — per-cohort `{ key, label, description,
    includeInPublicPercentages }`. The description is the contract the
    rollup query implements when filtering `node_traversals`.
  - `PUBLIC_COHORTS` — derived from `COHORT_DEFINITIONS` so flipping
    public visibility only edits one place.
  - `isCohort` / `isPublicCohort` — type guards for the request boundary
    and the public-reader path.
- `packages/telemetry/src/events.ts` now re-exports `Cohort` from
  `./cohorts` (single source of truth).
- `packages/telemetry/src/index.ts` exposes the new cohort surface.
- `apps/web/app/api/admin/rollup-branch-stats/route.ts` validates `cohort`
  with `isCohort` and reports `validCohorts: [...COHORTS]` instead of a
  hand-maintained Set. Admin trigger still accepts `alpha_beta` (admins
  can backfill it; the exclusion is from the *public* reader path, not
  from admin operations).
- `apps/worker/src/scheduler.ts`: `SCHEDULED_BRANCH_STATS_COHORTS` is now
  `PUBLIC_COHORTS` (derived). The recurring rollup therefore never writes
  `alpha_beta` rows by default, matching the documented policy.
- `apps/worker/src/jobs/branch-stats-rollup.ts`: `cohort` typed as
  `Cohort` from telemetry; `BranchStatsCohort` kept as a deprecated alias
  to avoid churn.
- `packages/db/prisma/schema.prisma` and `docs/TECHNICAL.md` updated to
  point at the typed source of truth instead of restating the union by
  hand.

## Commands run

- `pnpm --filter @researchcrafters/telemetry typecheck` — clean.
- `pnpm --filter @researchcrafters/telemetry build` — clean.
- `pnpm --filter @researchcrafters/telemetry test` — 16 passed (9 new
  cohort tests + 7 existing track tests).
- `pnpm --filter @researchcrafters/worker typecheck` — clean.
- `pnpm --filter @researchcrafters/worker vitest run test/scheduler.test.ts
  test/branch-stats.test.ts` — 11 passed (3 scheduler + 8 rollup).
- `pnpm --filter @researchcrafters/web typecheck` — pre-existing failures
  on this dirty branch (mentor budget caps, grade-override store, AI
  spend tracker exports). None reference the cohort module, admin
  rollup route, telemetry, or scheduler. Filtered grep confirms:
  `pnpm typecheck | grep -E "rollup-branch-stats|telemetry|scheduler|cohort"`
  returns no matches.

## Test coverage

`packages/telemetry/test/cohorts.test.ts` (9 tests):

- `COHORTS` enumerates the four canonical literals in the documented order.
- Every entry in `COHORT_DEFINITIONS` has a non-empty label and membership
  rule, and its `key` matches the map key.
- `alpha_beta.includeInPublicPercentages === false`; the other three are
  `true`.
- `PUBLIC_COHORTS` excludes `alpha_beta` and contains the other three.
- `isCohort` accepts each known cohort and rejects unknown strings,
  non-strings, and `null`/`undefined`.
- `isPublicCohort` rejects `alpha_beta` by default so it cannot leak into
  public percentages; accepts the three public cohorts; rejects unknown
  values.

Existing tests still cover:

- `apps/worker/test/scheduler.test.ts` — verifies the scheduler registers
  one repeating job per entry in `SCHEDULED_BRANCH_STATS_COHORTS` and is
  idempotent. With the derived value now `PUBLIC_COHORTS` (length 3),
  these tests continue to pass.

## Result

PASS for both claimed backlog items:

- Cohorts are defined as code with a single source of truth carrying
  precise membership rules, and consumers (admin route, scheduler, rollup
  job, schema, docs) all read from it.
- `alpha_beta` is excluded from public percentages by default:
  `COHORT_DEFINITIONS.alpha_beta.includeInPublicPercentages = false`
  drives `PUBLIC_COHORTS`, which drives `SCHEDULED_BRANCH_STATS_COHORTS`.
  `isPublicCohort` is available as the guard for any future public
  reader path. The admin trigger still accepts `alpha_beta` so backfill
  for internal analysis remains possible.

## Residual risks

- Public branch-percentage reader endpoints do not exist yet (the rollup
  itself is blocked on persisted `node_traversals` —
  `backlog/06-data-access-analytics.md:79`). When that lands, the reader
  must call `isPublicCohort` (or filter by `PUBLIC_COHORTS`) before
  serving rows; the typed surface is there, but no integration test
  yet exercises a public reader. Will be covered by the
  rollup-consumer backlog item.
- The rollup query still aggregates all `node_traversals` regardless of
  the cohort label written into the row (the existing rollup is a
  scaffold). Cohort filtering at the query level is the responsibility
  of the rollup-consumer backlog item once `node_traversals` are
  persisted; this iteration is intentionally limited to defining the
  cohorts and their public-exclusion property.
- The unrelated dirty worktree on this branch contains failing
  typechecks (mentor budget caps, grade-override store, AI spend
  tracker exports). Those are owned by other in-flight backlog items
  and are not affected by this change.
