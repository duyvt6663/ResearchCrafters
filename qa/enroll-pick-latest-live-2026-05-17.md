# QA: enroll route pins latest live package version (2026-05-17)

## Backlog item

- `backlog/06-data-access-analytics.md:65` — "New enrollments use latest live
  package version" (Data, Access, and Analytics Backlog > Version and Patch
  Policy).
- Skynet workflow item id: `e419006b-8288-4ca1-9811-fb26194f2a4a`.

## Scope tested

- `apps/web/app/api/packages/[slug]/enroll/route.ts` package-version
  resolution: filter must be `status: "live"` (skips `alpha` / `beta` /
  `archived`) and order must be `createdAt: "desc"` so the newest live row
  wins.
- Freshly created `Enrollment` rows must be pinned to the resolved
  latest-live `packageVersionId`. Pinning of existing enrollments is
  structural — `Enrollment.packageVersionId` is set on insert and never
  mutated by this route — so it is covered indirectly by exercising the
  "existing enrollment short-circuit" path.

## Change

- Added two regression tests to
  `apps/web/lib/__tests__/route-packages-enroll.test.ts`:
  1. `queries package versions with status:'live' ordered by newest first` —
     captures the `prisma.packageVersion.findFirst` call args and asserts
     `where = { package: { slug: "resnet" }, status: "live" }` and
     `orderBy = { createdAt: "desc" }`. Confirms the returned id flows into
     the response body and the back-compat `enrollment.packageVersionId`
     envelope.
  2. `creates new enrollments pinned to the resolved latest-live version id`
     — asserts `prisma.enrollment.create` is called with
     `data.packageVersionId` set to the resolved latest-live id and
     `status: "active"`. Existing-enrollment path already pinned by the
     other tests in the file.
- Updated the file docblock to call out the Version and Patch Policy
  contract being pinned.

No production code change — the route already implemented this contract.
The test pins it so a future refactor cannot regress to "pick any version"
or "pick alpha/beta" without a failing test.

## Out of scope (other Version and Patch Policy bullets)

The following related bullets remain pending and should be claimed in
follow-up iterations. They each carry distinct schema / API surface area
and should not have been folded into this batch:

- `:66` Keep existing enrollments pinned — structurally enforced today;
  follow-up should add an explicit test that publishing a new live version
  does not mutate the `packageVersionId` of existing rows.
- `:68` Allow only cosmetic overlays for patches — needs overlay validator
  in patch authoring path.
- `:69` Record active `patch_seq` on stage attempts — schema migration
  (`StageAttempt.patchSeq`) + attempt-creation wiring.
- `:70` Require new package version for graph/stage/rubric/runner/solution
  changes — validator in package authoring path.
- `:71` Make migration opt-in — migration flow + UI.

## Commands

```
cp .skynet-wt/enroll-latest-live/apps/web/lib/__tests__/route-packages-enroll.test.ts \
   apps/web/lib/__tests__/route-packages-enroll.test.ts   # main repo has node_modules
cd apps/web && ./node_modules/.bin/vitest run lib/__tests__/route-packages-enroll.test.ts
# 7 tests passed (5 existing + 2 new)
git checkout -- apps/web/lib/__tests__/route-packages-enroll.test.ts   # revert main repo
```

## Result

- PASS — `Test Files 1 passed (1)`, `Tests 7 passed (7)` in 688ms.

## Residual risks

- Test runs vitest from the dirty main worktree's `node_modules` because the
  fresh `.skynet-wt/enroll-latest-live` worktree could not complete
  `pnpm install` within the agent timeout. The file copied is byte-identical
  to the worktree edit; CI on the branch will be the authoritative run.
- Tests pin the call shape of `prisma.packageVersion.findFirst`. A Prisma
  major-version rename (e.g. `where` -> `filter`) would break them
  syntactically rather than semantically; reviewers should regenerate the
  expected call object on such bumps.
- No coverage yet for the "no live version exists" path (route falls back to
  the synthesized stub id). Acceptable — that path already has an existing
  test (`omits both fields for anonymous callers`) which exercises the same
  fallback.
