# QA: Trace ↔ curriculum branch id convention alignment

**Backlog item:** `backlog/04-validation-evaluator.md:39` — Verify trace
nodes that map to curriculum branches use the same id convention so trace
and curriculum stay aligned.

## Change summary

`packages/content-sdk/src/validator/ara-cross-link.ts`

- Added a third trace-validation pass that enforces a 1:1 mapping between
  trace `kind: branch` nodes and curriculum branches on `branch_id`:
  - `trace.branch_id.duplicate` (error) — two trace branch nodes claim the
    same curriculum `branch_id`.
  - `trace.branch.unmapped` (warning) — a curriculum branch has no
    corresponding trace branch node with a matching `branch_id`.
- The pass runs only over trace branch nodes whose `branch_id` resolves to
  an existing curriculum branch, so it composes cleanly with the existing
  `trace.branch_id.unresolved` and `trace.branch_id.missing` checks rather
  than re-flagging the same cases.

`packages/content-sdk/test/validator.test.ts`

- Extended the existing bad-trace fixture test to add two extra
  `kind: branch` nodes (`T003`, `T004`) both pointing at the real
  `branch-a` curriculum branch and asserts `trace.branch_id.duplicate`
  fires.
- Added a new test `warns when a curriculum branch has no trace branch
  node` that clones `sample-package` (which has curriculum `branch-a` but
  no trace branch nodes) and asserts a `trace.branch.unmapped` warning is
  emitted with `ref: branch-a`.

`backlog/04-validation-evaluator.md`

- Ticked the line-39 bullet and recorded the validator behavior inline.

## Verification

Run from the repo root.

1. **Type check** — `pnpm --filter @researchcrafters/content-sdk typecheck`
   → clean.
2. **Lint** — `pnpm --filter @researchcrafters/content-sdk lint` → clean.
3. **Build** — `pnpm --filter @researchcrafters/content-sdk build` → clean.
4. **Unit tests** — `pnpm --filter @researchcrafters/content-sdk test` →
   **25/25 passing** (was 24/24; +1 new test). Both new assertions fire:
   `trace.branch_id.duplicate` on the extended bad-trace fixture, and
   `trace.branch.unmapped` (`ref: branch-a`) on the clean sample-package
   clone.
5. **Real-world fixture** — direct call to `validateAraCrossLink` on
   `content/packages/resnet`: **0 errors, 0 warnings**. The resnet
   exploration tree already maps each of the three curriculum branches
   (`branch-residual-canonical`, `branch-deeper-no-residual`,
   `branch-bottleneck-suboptimal`) 1:1 to a `kind: branch` trace node, so
   the new checks confirm alignment instead of flagging it.

## Notes / scope boundaries

- "Same id convention" is interpreted as: every curriculum `branch.id` is
  represented by exactly one trace `kind: branch` node and vice versa, so
  the two artifacts stay in lock-step when a branch is renamed, added, or
  removed. This is the minimal alignment guarantee; a stricter
  prefix/slug-pattern check (e.g. forcing all branch ids to share a
  `branch-` prefix) is intentionally not added — it would have to be
  driven by an explicit convention in `packages/erp-schema` rather than
  inferred from sample data.
- `trace.branch.unmapped` is a warning, not an error, so packages still in
  authoring (where the trace lags the curriculum) are not blocked from
  passing structural validation; it surfaces visibly in the report so the
  authoring agent can close the gap.
- The pre-existing dirty changes on this branch from the line-33 trace
  schema-validation work are left intact; this iteration adds on top of
  them rather than replacing them, since the new checks depend on the
  `branch_id` plumbing that work introduced.
