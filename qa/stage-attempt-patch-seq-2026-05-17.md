# QA — Record active patch_seq on stage attempts (backlog/06 §Version and Patch Policy)

- **Backlog item:** `backlog/06-data-access-analytics.md:69` — "Record active `patch_seq` on stage attempts."
- **Item id:** `2f4b1622-ba67-490e-8f50-aa183b9a0229`
- **Date:** 2026-05-17
- **Branch at start:** `skynet/pr/mentor-cache-stage-static-context-2026-05-16` (dirty worktree owned by another in-flight PR; this iteration's edits are scoped to the files below).

## Scope

Persist the currently-active `PackageVersionPatch.patchSeq` on each new
`StageAttempt` row so analytics, replays, and grade audits can attribute the
attempt to a specific cosmetic-patch generation even after newer patches land
against the same `PackageVersion`. Pairs with the cosmetic-overlay contract
locked down in `qa/cosmetic-overlay-patch-contract-2026-05-17.md` (backlog/06
line 68).

Related backlog lines (70–73 — version-bump requirement, opt-in migration,
preserve learner state, reset grading) are intentionally not bundled: each
needs a separate plumbing pass and bundling would have made this change
unfocused. They were inspected via `skynet_backlog` `related_items` and left
pending for follow-up iterations.

## Change set

- `packages/db/prisma/schema.prisma` — adds
  `StageAttempt.patchSeq Int @default(0)` with an inline doc explaining the
  freeze-at-creation contract (lines 426–451).
- `packages/db/prisma/migrations/2_stage_attempt_patch_seq/migration.sql` —
  `ALTER TABLE "StageAttempt" ADD COLUMN "patchSeq" INTEGER NOT NULL DEFAULT 0;`
  Default backfills existing rows to base (no cosmetic patches applied).
- `packages/db/src/active-patch-seq.ts` — new `resolveActivePatchSeq` helper:
  pure Prisma `aggregate` over `PackageVersionPatch._max.patchSeq`, returns
  `0` when no rows exist, clamps negative / non-finite / fractional values
  defensively. Same dependency-injection shape as
  `mentor-budget-caps.ts` so it can be exercised without a live DB.
- `packages/db/src/index.ts` — re-exports `resolveActivePatchSeq` and its
  types.
- `packages/db/test/active-patch-seq.test.ts` — 5 unit tests covering: no
  patches → 0, max returned, defensive clamping (negative / NaN / Infinity),
  fractional flooring, and that the injected `withQueryTimeout` wrapper
  runs the call.
- `apps/web/app/api/submissions/route.ts` — calls `resolveActivePatchSeq`
  immediately before `prisma.stageAttempt.create` and includes
  `patchSeq` in the create payload. Resolver failures are swallowed and
  fall back to `0` so a transient read error can't block submission init.
- `apps/web/app/api/stage-attempts/route.ts` — when the body omits
  `patchSeq`, resolves the active value against `enr.packageVersionId`
  and forwards it to telemetry; a caller-supplied `patchSeq` is still
  honored verbatim (used by replay / migration tooling).
- `apps/web/lib/__tests__/route-submissions-init.test.ts` — extends the
  `@researchcrafters/db` mock with `resolveActivePatchSeq`, asserts the
  attempt row carries the resolved `patchSeq`, and adds two new cases:
  non-zero patch_seq is frozen on the row, and a thrown resolver falls
  back to 0.
- `apps/web/lib/__tests__/route-stage-attempts.test.ts` — adds two new
  cases: resolver is called with the enrollment's packageVersionId and its
  result flows into telemetry; caller-pinned `patchSeq` skips the resolver.

The runner callback path (`apps/web/app/api/runs/[id]/callback/route.ts`)
was inspected — it updates `executionStatus` / `gradeId` only and does not
touch `patchSeq`, so the column stays frozen post-create as intended.

## Commands

```
pnpm --filter @researchcrafters/db test
```

Result: **31 passed | 1 skipped** (5 new in `active-patch-seq.test.ts`,
all prior db tests green).

```
pnpm --filter @researchcrafters/web test -- --run \
  lib/__tests__/route-stage-attempts.test.ts \
  lib/__tests__/route-submissions-init.test.ts
```

Result: **17 passed** (8 in `route-stage-attempts.test.ts`, 9 in
`route-submissions-init.test.ts`).

## Residual risks / follow-ups

- **No `patchSeq` writers other than the submission/stage-attempt init
  paths.** Any future code that constructs `StageAttempt` rows directly
  (CLI replay, backfill scripts) must also call `resolveActivePatchSeq`
  or pass a pinned value; the column defaults to `0` so omission silently
  attributes the attempt to base.
- **`patchSeq` is currently not exposed on the read side.** Stage-attempt
  page and analytics queries can already `SELECT` it once they need patch-
  cohort splits; no downstream consumer is wired up in this iteration.
- **Migration assumes no concurrent writers.** Default `0` backfills rows
  in-place; the column is `NOT NULL` so apps must redeploy with the new
  Prisma client before running the migration on a live DB. Standard
  ResearchCrafters deploy order already handles this.
- **Related backlog lines 70–73 remain open** and were intentionally not
  claimed — each is a separate iteration as flagged by the prior
  cosmetic-overlay QA pass.

## Verdict

Pass. Schema + helper + write-path wiring are in place; focused unit tests
pin the contract on both routes and the resolver; no pre-existing tests
regressed.
