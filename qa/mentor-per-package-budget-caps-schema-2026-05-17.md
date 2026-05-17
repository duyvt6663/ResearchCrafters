# QA Report — Per-package mentor budget caps in the database schema

- Backlog item: `backlog/05-mentor-safety.md:106` — "Surface per-package
  mentor budget caps in the database schema."
- Workflow item id: `4fe3609b-c9b0-4dab-b82c-fe228c7b9103`
- Date: 2026-05-17

## Scope tested

- `packages/db/prisma/schema.prisma`: three new nullable USD columns on
  `PackageVersion` — `mentorBudgetUserDailyUsd`, `mentorBudgetPackageUsd`,
  `mentorBudgetStageUsd`.
- Additive migration
  `packages/db/prisma/migrations/1_mentor_budget_caps/migration.sql`
  (idempotent `ALTER TABLE ... ADD COLUMN` for the three columns).
- New resolver `resolveMentorBudgetCaps()` in
  `packages/db/src/mentor-budget-caps.ts` that overlays populated columns
  on platform defaults (returns defaults when columns are `null`, skips
  non-positive / non-finite overrides, throws on missing rows).
- Public re-exports from `packages/db/src/index.ts`
  (`resolveMentorBudgetCaps`, `PackageVersionNotFoundError`, the
  `MentorBudgetCapsUsd` / `MentorBudgetCapsPrisma` /
  `ResolveMentorBudgetCapsOptions` types).
- Backlog status updated to checked with implementation pointers.

Out of scope (intentionally deferred so this item stays implementation-
sized):

- Wiring `apps/web/lib/mentor-runtime.ts` to call
  `resolveMentorBudgetCaps()` instead of `defaultMentorBudgetCaps()`. The
  resolver is now available; swapping the production call site requires
  threading `packageVersionId` and is a separate change.
- Authoring UI for editing the columns. The data layer is in place; the
  package-author / platform-admin form is a separate backlog item.

## Commands run

```
pnpm --filter @researchcrafters/db vitest run test/mentor-budget-caps.test.ts
pnpm --filter @researchcrafters/db vitest run
pnpm --filter @researchcrafters/db exec tsc --noEmit
DATABASE_URL='postgres://x:x@localhost:5432/x' \
  pnpm --filter @researchcrafters/db exec prisma validate
```

## Results

- New unit suite passes: 5/5 (`mentor-budget-caps.test.ts`). Covers
  default fall-through, partial overrides, non-positive/NaN guards,
  missing-row error, and that the injected `withQueryTimeout` wrapper is
  invoked.
- Full `@researchcrafters/db` vitest run: **26 passed, 1 skipped** — no
  regressions in `crypto.test.ts` or `grade-store.test.ts`.
- `tsc --noEmit`: no errors in the newly added files
  (`mentor-budget-caps.ts`, `mentor-budget-caps.test.ts`). Pre-existing
  errors in `src/grade-store.ts` and `src/seed.ts` are unchanged on `main`
  and out of scope here.
- `prisma validate`: `The schema at prisma/schema.prisma is valid 🚀`.

## Pass / fail

- PASS — schema, migration, resolver, and tests are in place; package
  validation and focused tests are green; no in-scope regressions.

## Residual risks / follow-ups

- The migration has not yet been applied against a live Postgres in this
  run. The additive `ALTER TABLE ... ADD COLUMN` against nullable
  `DOUBLE PRECISION` is standard Postgres DDL and matches the manually
  authored convention used by `0_init/migration.sql`, but the deploy team
  should still run
  `pnpm --filter @researchcrafters/db exec prisma migrate deploy`
  during the next environment refresh.
- `apps/web/lib/mentor-runtime.ts` still calls
  `defaultMentorBudgetCaps()` exclusively. Until a follow-up swaps in
  `resolveMentorBudgetCaps()` per-request, populating the new columns has
  no runtime effect. Tracked alongside the existing open gap
  "Wire production `SpendStore` and `RateLimiter` implementations".
- No package-author UI for editing the caps yet — see the open
  follow-ups in `backlog/05-mentor-safety.md`.
