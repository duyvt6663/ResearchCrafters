# QA: evaluator-sdk writing-evaluator metadata

Scope: `backlog/04-validation-evaluator.md` — "Emit writing-evaluator metadata
for allowed evidence refs, rubric version, citation policy, and redaction
status."

Upstream backlog item: `96a93e62-253f-4f00-ae65-32c0222a191c`.

## Changes verified

- `packages/evaluator-sdk/src/types.ts` — new `WritingEvaluatorMetadata`
  interface (rubricVersion + optional citationPolicy snapshot + optional
  redaction snapshot) and `Grade.writingEvaluator?` field. Non-writing grades
  emit the same payload shape as before.
- `packages/evaluator-sdk/src/grade.ts` — `gradeAttempt` accepts a new
  optional `redaction: { triggered, targets, matchedTargets? }` input.
  `buildWritingEvaluatorMetadata` composes the block from the
  `enforceCitationPolicy` result + redaction snapshot when either surface is
  exercised. Attached via spread so non-writing grades retain bit-identical
  output.
- `packages/evaluator-sdk/test/grade.test.ts` — 4 new cases:
  - non-writing grade omits `writingEvaluator`.
  - `citationPolicy` block emits mode/verdict/allowedRefs/placeholder/claim
    totals.
  - redaction snapshot with empty `matchedTargets` (defaulted to `[]`).
  - redaction `triggered=true` + `matchedTargets` alongside a citation block.
- `backlog/04-validation-evaluator.md` — item marked done with iteration
  notes pointing at the types + grade integration.

## Commands

From `packages/evaluator-sdk`:

- `tsc --noEmit` → clean.
- `vitest run test/grade.test.ts` → 15/15 passing (4 new metadata cases plus
  the 4 citation-policy enforcement cases from the stacked PR and the 7
  pre-existing grade tests).

## Residual risk

- Consumers must opt in by reading `grade.writingEvaluator`; the field is
  optional and absent on non-writing stages. Web/UI and audit consumers that
  want the provenance must be wired separately.
- The redaction snapshot is supplied by the caller (mentor/LLM-grader
  redaction pass). The evaluator does not run redaction itself; it only
  surfaces what the caller reports. Documented on `GradeAttemptInput.redaction`.

## Out of scope

- Adversarial math grader tests (`qa/evaluator-adversarial-math-grader-tests-2026-05-16.md`)
  — separate QA item.
