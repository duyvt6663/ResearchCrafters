# QA Report — Shape-Table and Memory/Complexity Checks (Math Evaluation)

- Backlog item: `backlog/04-validation-evaluator.md` — Math Evaluation:
  "Add shape-table and memory/complexity checks for implementation-linked
  math stages."
- Workflow item: `41d07454-fffa-45e7-9d2d-18f7897c3d84`
- Date: 2026-05-16

## Scope tested

- New module `packages/evaluator-sdk/src/implementation-checks.ts`:
  - `checkShapeTable(observed, spec)` — validates a learner's observed
    `{ name -> shape }` map against an authored expected shape table.
    Stable entry ordering: expected names in authored order, then any
    `unexpected` entries when `allowExtra` is false.
  - `checkComplexityBound(observation, spec)` — one- or two-sided scalar
    bound. Reports tightest-edge `slack` (positive when inside the bound,
    negative when over/under).
  - `checkComplexityBatch(observations, specs)` — aggregator with
    `passRatio`.
- Public re-exports added to `packages/evaluator-sdk/src/index.ts`:
  `checkShapeTable`, `checkComplexityBound`, `checkComplexityBatch`,
  and the supporting types `ShapeTableSpec`, `ShapeTableEntryStatus`,
  `ShapeTableEntryResult`, `ShapeTableResult`, `ComplexityBoundSpec`,
  `ComplexityBoundFailureReason`, `ComplexityBoundResult`,
  `ComplexityBoundBatch`.
- Unit tests in `packages/evaluator-sdk/test/implementation-checks.test.ts`
  (24 cases) covering: shape-table happy path, shape mismatches,
  missing observations, unexpected entries (default and `allowExtra`),
  rank-0 scalars, invalid expected shape entries, empty expected map,
  undefined observed map, complexity bounds (one- and two-sided),
  inclusive edges, spec_invalid (no bound, max<min), missing/non-finite
  observations, non-scalar values, unit mismatches, optional units,
  and batch aggregation with mixed pass/fail.

Not in scope (deferred to sibling Math Evaluation items still in
`backlog/04-validation-evaluator.md`):

- Per-step partial credit for derivation modules.
- Proof/counterexample/conceptual rubric fallback.
- Adversarial grader tests for math stages.
- Declarative wiring through a stage-schema `validation.shape_table` /
  `validation.complexity_bounds` block (consumable today via a custom
  `scoreDimensions` callback in `gradeAttempt`; declarative authoring
  is a separate evaluator-service item).

## Behaviour

- **Shape table**: each expected entry is checked exactly (dim-by-dim).
  Negative or non-integer dims in the spec become `spec_invalid`. The
  default rejects unexpected observations; `allowExtra: true` suppresses
  the `unexpected` entries. `passRatio` is computed over the expected
  entries only; `unexpected` entries flip `passed` to false without
  inflating the denominator.
- **Complexity bound**: requires at least one of `max`/`min`. When both
  are set, `max < min` is `spec_invalid`. Bounds are inclusive at the
  edge. Non-scalar or non-finite values fail with dedicated reasons
  (`not_scalar`, `not_finite`) and never coerce. Unit gating reuses the
  string-equality contract of the numeric module so authors share a
  single unit vocabulary.
- **Slack semantics**: when inside the bounds, `slack` is the distance
  to the binding edge (the tighter of the two when both are set). When
  failing, `slack` is the signed gap to the violated edge (negative).
  This is the deterministic signal the rubric layer composes into
  partial-credit dimension scores.

## Commands run

```
cd packages/evaluator-sdk
pnpm typecheck   # clean
pnpm test        # 61 tests across 4 files (implementation-checks: 24 tests)
pnpm lint        # clean
pnpm build       # tsc clean
```

Result: PASS.

## Residual risks / follow-ups

- Stage-schema wiring: there is still no authored
  `validation.shape_table` / `validation.complexity_bounds` field on
  stage schemas. The deterministic primitives are usable today through
  `gradeAttempt`'s `scoreDimensions` hook, but a follow-up backlog item
  should add the declarative form, parse it in `parseRunnerArtifacts`,
  and surface the per-entry results as evidence refs on the grade.
- Shape source: `RunArtifacts` does not yet expose a typed shape map;
  callers currently lift shape probes out of `artifactPointers` /
  custom JSON. A typed `runArtifacts.shapes?: Record<string, number[]>`
  field is the natural next step but lives in the runner/contract item,
  not here.
- Unit handling stays string-equality (no SI conversion). Authors must
  pick a canonical unit per id, same convention as `checkNumeric`.
