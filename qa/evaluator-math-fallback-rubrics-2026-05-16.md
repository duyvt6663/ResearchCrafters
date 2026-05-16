# QA: evaluator math-fallback rubrics

- **Backlog item:** `backlog/04-validation-evaluator.md:91` — Add rubric
  fallback for proof outlines, counterexamples, and conceptual explanations.
- **Branch:** `skynet/pr/evaluator-math-fallback-rubrics-2026-05-16`
- **Date:** 2026-05-16

## Scope tested

New module `packages/evaluator-sdk/src/math-fallback.ts` providing the
deterministic structural pre-checks and the default rubric scaffold for the
three math-evaluation submission kinds that escape the existing numeric /
shape-table / derivation primitives:

- **Proof outlines** — step count + per-step justification presence; default
  rubric scaffold dimensions: `logical_validity`, `completeness`, `clarity`.
- **Counterexamples** — witness presence, required-violated-claim coverage,
  optional caller-supplied verifier; default rubric scaffold dimensions:
  `witness_validity`, `explanation_quality`.
- **Conceptual explanations** — case-insensitive concept coverage and
  inclusive `[minWords, maxWords]` length window; default rubric scaffold
  dimensions: `concept_accuracy`, `coverage`, `clarity`.

The module is intentionally self-contained — no dependency on `numeric.ts`
(still in open PR `skynet/pr/evaluator-deterministic-numeric-checks-2026-05-16`),
no LLM gateway dependency, no side effects. Qualitative scoring is delegated:
the result carries `rubricScaffold.dimensions` for downstream `llmGrade`
plus a `dimensions: RubricDimensionScore[]` with the deterministic checks.

`index.ts` re-exports the public API.

## Commands run

```
cd packages/evaluator-sdk
npx vitest run test/math-fallback.test.ts
npx vitest run --exclude '**/derivation.test.ts' --exclude '**/implementation-checks.test.ts'
npx tsc --noEmit src/math-fallback.ts src/types.ts \
  --target ES2022 --module nodenext --moduleResolution nodenext \
  --strict --esModuleInterop
```

## Results

- `vitest run test/math-fallback.test.ts` — **23 / 23 pass**.
- Full suite (with the two pre-existing untracked tests excluded):
  **37 / 37 pass** across `math-fallback.test.ts`, `llm-grader.test.ts`,
  `grade.test.ts`.
- Isolated `tsc --noEmit` over `math-fallback.ts` + `types.ts` — clean, no
  diagnostics.

## Residual risks

- The package-level `tsc --noEmit` still flags
  `src/derivation.ts` and `src/implementation-checks.ts` for
  `Cannot find module './numeric.js'`. Those files are untracked
  worktree artifacts owned by separate open backlog branches
  (`skynet/pr/evaluator-deterministic-numeric-checks-2026-05-16` adds
  `numeric.ts`). They are not part of this task and were left untouched
  per project working rules ("keep unrelated dirty worktree changes out
  of your task"). Once that PR lands and the dependent backlog items
  merge, the SDK-wide `tsc --noEmit` will return green again.
- The structural checks are conservative: they catch obvious malformed
  submissions (missing justification, missing witness, missing concept,
  out-of-range length) but cannot judge *correctness* of the argument.
  That stays delegated to the qualitative grader the caller wires
  through `gradeAttempt`'s `scoreDimensions` callback or by calling
  `llmGrade` with the returned `rubricScaffold`.
- Concept-coverage matching is case-insensitive substring containment,
  intentional for tag-style required concepts. Authors who need stricter
  matching can pre-tokenize or supply a custom `rubricScaffold` plus
  their own grader.

## Files touched

- `packages/evaluator-sdk/src/math-fallback.ts` *(new)*
- `packages/evaluator-sdk/test/math-fallback.test.ts` *(new)*
- `packages/evaluator-sdk/src/index.ts` *(re-exports)*
- `backlog/04-validation-evaluator.md` *(tick item)*
