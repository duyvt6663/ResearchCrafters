# QA Report — Deterministic Numeric Checks (Math Evaluation)

- Backlog item: `backlog/04-validation-evaluator.md` — Math Evaluation:
  "Add deterministic numeric checks with tolerance and unit/shape metadata."
- Workflow item: `64737f1d-f896-452a-b351-4fff69200156`
- Date: 2026-05-16

## Scope tested

- New module `packages/evaluator-sdk/src/numeric.ts` implementing
  `checkNumeric`, `checkNumericBatch`, `inferShape`, and
  `metricsToObservations`.
- Public re-exports from `packages/evaluator-sdk/src/index.ts` (types
  `NumericCheckSpec`, `NumericCheckResult`, `NumericCheckBatch`,
  `NumericCheckFailureReason`, `NumericObservation`, `NumericTolerance`,
  `NumericValue`).
- Unit tests covering tolerance modes, unit equality, shape inference and
  shape-table gating, tensor walk, ragged-tensor rejection, missing/non-finite
  observations, batch aggregation, and metrics adapter.

Not in scope (deferred to sibling Math Evaluation items already in
`backlog/04-validation-evaluator.md`):

- Shape-table and memory/complexity checks for implementation-linked math
  stages.
- Per-step partial credit for derivation modules.
- Proof/counterexample/conceptual rubric fallback.
- Adversarial grader tests for math stages.

## Behaviour

- `checkNumeric(observation, spec)` returns a typed result with `passed`,
  `reason`, `maxAbsError`, `maxRelError`, `observedShape`, `observedUnit`.
- Tolerance: when both `absolute` and `relative` are present, numpy-isclose
  semantics apply (`|a-e| <= atol + rtol*|e|`). When only one is set, that
  one must hold. Negative tolerances and empty tolerance fail
  `spec_invalid`.
- Unit metadata: if `spec.unit` is set, observed unit must equal it
  exactly; missing unit on observation is `unit_mismatch`. If `spec.unit`
  is omitted, the observation's unit (if any) is reported but never
  enforced.
- Shape metadata: declared `spec.shape` is cross-checked against the
  expected literal's inferred shape; observed values must be uniform
  tensors with the same shape. Ragged tensors are rejected as
  `shape_mismatch`.
- Tensor comparison walks paired leaves, tracks worst-case absolute and
  relative residuals, and short-circuits on the first failure.
- `checkNumericBatch` aggregates per-spec results with a `passRatio` for
  partial-credit dimension scoring.
- `metricsToObservations` lifts `RunArtifacts.metrics` plus an optional
  unit hint map into the observation map expected by `checkNumericBatch`.

## Commands run

```
cd packages/evaluator-sdk
pnpm typecheck   # clean
pnpm test        # 37 tests across 3 files (numeric: 23 tests)
pnpm lint        # clean
pnpm build       # tsc clean
```

Result: PASS.

## Residual risks / follow-ups

- Authored stage shape — there is not yet a `validation.numeric_checks`
  declaration on the stage schema; this module is consumable today by a
  custom `scoreDimensions` callback in `gradeAttempt`. Wiring authored
  numeric-check specs through `stagePolicy.validation` is the next
  Math Evaluation backlog item ("shape-table and memory/complexity
  checks for implementation-linked math stages").
- Unit handling is string-equality only; no SI conversion. Authors
  must pick a canonical unit per check id.
- Element-wise tensor comparison does not vectorize; tensors are
  expected to be small math-answer shapes, not training tensors.
