# QA: Writing-evaluator unsupported-claim flag/reject primitive

- Backlog item: `backlog/04-validation-evaluator.md:101` — _Reject or flag
  unsupported claims that cite no allowed evidence ref._
- Section: Validation and Evaluator Backlog > Academic Writing Evaluation
- Workflow item id: `cf90e977-7ffd-41bd-a3c5-aabf66eee6ab`
- Date: 2026-05-16

## Scope tested

Added a deterministic primitive in `@researchcrafters/evaluator-sdk` that
the writing-rubric layer (and the LLM grader) can call to flag or reject
claims that fail the stage's evidence policy:

- `packages/evaluator-sdk/src/writing-claims.ts`
  - `checkWritingClaim(spec, policy)` — per-claim verdict
  - `checkWritingClaimBatch(specs, policy)` — batch aggregation
  - `extractCitationRefs(text)` — helper for bracket-style citation tokens
  - Types: `WritingClaimSpec`, `WritingClaimPolicy`, `WritingClaimResult`,
    `WritingClaimBatch`, `WritingClaimFailureReason`
- Re-exported the new symbols from `packages/evaluator-sdk/src/index.ts`.
- Added unit tests in `packages/evaluator-sdk/test/writing-claims.test.ts`.

The primitive intentionally returns a `flagged` boolean alongside `passed`
rather than throwing — the rubric/LLM-grader layer composes it under the
existing `gradeAttempt` flow and decides whether to down-score, surface to
the learner, or escalate to `EvaluatorRefusal` for hard rejection.

### Failure-reason coverage

| Scenario | `passed` | `flagged` | `reason` |
| --- | --- | --- | --- |
| Uncited claim | false | true | `no_citation` |
| Cited against allow-list | true | false | _none_ |
| Cited outside allow-list | false | true | `disallowed_citation` |
| Mixed allowed + disallowed | false | true | `disallowed_citation` (unauthorized wins) |
| Placeholder, stage allows | true | true | _none_ (surfaced for UI) |
| Placeholder, stage forbids | false | true | `placeholder_disallowed` |
| `requiresCitation: false` claim | true | false | _none_ |
| Allowed + placeholder mix (placeholder allowed) | true | true | _none_ |
| Missing id / text | false | true | `spec_invalid` |

## Commands run

```
cd packages/evaluator-sdk
pnpm typecheck
npx vitest run test/writing-claims.test.ts
```

Results:

- `pnpm typecheck` — passes, no errors.
- `npx vitest run test/writing-claims.test.ts` —
  `Test Files 1 passed (1) / Tests 15 passed (15)`.

The package-wide `pnpm test` has pre-existing failures in
`test/derivation.test.ts` and `test/adversarial-math-grader.test.ts` from
an earlier in-flight iteration (untracked WIP files) that are unrelated to
this change. Verified by running the new test file in isolation.

## Residual risks

- Claim splitting is left to the caller (LLM extraction or authored
  fixtures). This module only verifies the citation set per claim; future
  work in this section (item 102: citation policy, item 104: regression
  fixtures, item 106: writing-evaluator metadata) will wire claim
  extraction and metadata emission into the grade pipeline.
- `extractCitationRefs` only recognizes `[token]` bracket tokens. Authors
  using LaTeX `\cite{...}` or numeric `[1]` style will need to pre-process
  or rely on the structured `citedRefs` path; this is by design to keep
  the primitive deterministic.
- The primitive is not yet wired into `gradeAttempt` / `llmGrade`. The
  next backlog item (citation policy enforcement, item 102) is where the
  writing-evaluator pipeline composes this with the rubric scorer.
