# QA: Evaluator deterministic intermediate-result persistence

- Backlog item: `backlog/04-validation-evaluator.md:100` - "Persist deterministic
  intermediate results so a partial failure can resume without re-running
  upstream checks."
- Workflow item id: `30da99fa-2411-44d2-ac77-16052aa9a753`
- Branch: `skynet/pr/sandbox-canonical-output-paths-plans-2026-05-15`

## Scope

Added an optional `IntermediateStore` to `@researchcrafters/evaluator-sdk` and
threaded it through `gradeAttempt`. When supplied, the evaluator persists a
deterministic checkpoint of:

1. Preflight result (executable-stage execution status + evidence-required
   check) - only written when preflight passes.
2. Deterministic dimension scores produced by the built-in default scorer.

On a subsequent invocation with the same idempotency key the evaluator:

- Skips the preflight branches when `preflightPassed` is recorded.
- Reuses `deterministicDimensions` instead of recomputing them.
- Still respects the final grade idempotency: a stored grade short-circuits
  before any intermediate lookup, matching the existing contract.

Custom (non-deterministic) `scoreDimensions` callbacks are always re-run and
never cached, but the preflight checkpoint is still recorded so that downstream
failures do not force re-validating evidence/execution on retry.

Files touched:

- `packages/evaluator-sdk/src/intermediate.ts` (new)
- `packages/evaluator-sdk/src/grade.ts`
- `packages/evaluator-sdk/src/index.ts`
- `packages/evaluator-sdk/test/intermediate.test.ts` (new)
- `backlog/04-validation-evaluator.md` - bullet checked off.

## Verification

Commands run from repo root:

- `cd packages/evaluator-sdk && npx vitest run`
  - 3 files, 18 tests passed (previous 14 plus 4 new resume cases).
- `cd packages/evaluator-sdk && npx tsc --noEmit`
  - Clean.

New test cases (`test/intermediate.test.ts`):

1. Default scorer + `intermediateStore` writes a snapshot containing
   `preflightPassed=true`, `executionStatus`, resolved `passThreshold`, and
   the deterministic dimension scores.
2. Simulated partial failure (`store.insert` throws once) leaves the snapshot
   intact; retry with deliberately worse `runArtifacts` (executable stage +
   `executionStatus=timeout`, failing tests) still resolves to `passed` with
   `rubricScore=1`, proving preflight was skipped and cached dimensions were
   reused rather than recomputed from the new artifacts.
3. Custom scorer path persists preflight only; `deterministicDimensions` is
   undefined in the snapshot.
4. Preflight refusal (executable stage with `executionStatus=timeout`) writes
   no snapshot - the snapshot is reserved for state the evaluator wants to
   resume from.

## Risks / Notes

- Behaviour for callers that do not pass `intermediateStore` is unchanged
  (option is `?:`). Existing `grade.test.ts` continues to pass.
- The intermediate store is intentionally separate from `GradeStore` so the
  Postgres wiring can land independently; the in-memory implementation mirrors
  `InMemoryGradeStore` for tests/local dev.
- Cache reuse trusts the idempotency key. If a caller mutates the inputs that
  contribute to the key between attempts they will simply miss the cache -
  same property the grade-level idempotency already relies on.
- Out of scope: Postgres-backed `IntermediateStore` implementation and the web
  app wiring; those become follow-up backlog items once the contract is in
  place.

## Result

PASS. Marking the backlog item complete; QA flow continues automatically.
