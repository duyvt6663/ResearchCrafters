# QA: Writing-evaluator citation policy enforcement

- Backlog item: `backlog/04-validation-evaluator.md` — _Enforce citation
  policy: verified allowed citations only, or explicit placeholders where
  the stage allows placeholders._
- Section: Validation and Evaluator Backlog > Academic Writing Evaluation
- Workflow item id: `6f8af1d7-9b38-4018-a501-6a0497193f65`
- Date: 2026-05-16

## Scope tested

Wires the existing per-claim primitive (`checkWritingClaim`,
`checkWritingClaimBatch`) into a stage-level enforcement layer that the
grade pipeline can call directly. Builds on the writing-claim primitive
introduced by PR #38.

- `packages/evaluator-sdk/src/writing-claims.ts` (already on the primitive
  branch this PR stacks on)
  - `enforceCitationPolicy(claims, policy, { mode })` — aggregates the
    batch verdict into a single `passed | failed` outcome plus a
    feedback-ready summary. Strict mode flips to `failed` as soon as any
    claim fails; flag mode keeps the verdict `passed` and lets the rubric
    layer handle down-scoring.
  - Types: `CitationEnforcementMode`, `CitationEnforcementVerdict`,
    `CitationEnforcementResult`.
- `packages/evaluator-sdk/src/grade.ts` (this PR)
  - `GradeAttemptInput.citationPolicy` (optional) carries
    `{ policy, claims, mode }`.
  - After preflight + before scoring, `gradeAttempt` runs the enforcement
    helper. Strict + failures → `EvaluatorRefusal('citation_policy_violation',
    …)`. Flag mode → the enforcement summary is appended to the grade
    feedback string.
  - `EvaluatorRefusal` reason union extended with
    `'citation_policy_violation'`.

### Coverage matrix

| Scenario | Mode | Verdict | Refusal? |
| --- | --- | --- | --- |
| All claims cite allow-listed refs | strict | passed | no |
| Any uncited claim | strict | failed | `citation_policy_violation` |
| Any disallowed citation | strict | failed | `citation_policy_violation` |
| Placeholder citation, stage allows placeholders | strict | passed (flagged) | no |
| Placeholder citation, stage forbids placeholders | strict | failed | `citation_policy_violation` |
| Same uncited claim under flag mode | flag | passed | no, summary appended to feedback |
| Empty claim list | strict | passed | no |

## Commands run

```
cd packages/evaluator-sdk
pnpm typecheck
npx vitest run test/writing-claims.test.ts test/grade.test.ts
```

Results:

- `pnpm typecheck` — passes, no diagnostics.
- `npx vitest run test/writing-claims.test.ts test/grade.test.ts` —
  `Test Files 2 passed (2) / Tests 32 passed (32)`.
  - `writing-claims.test.ts`: 21 tests (15 pre-existing + 6
    `enforceCitationPolicy` tests covering strict/flag/placeholder/empty
    cases and the refusal payload shape — inherited from PR #38).
  - `grade.test.ts`: 11 tests (7 pre-existing + 4 new tests covering
    strict-mode refusal on uncited + disallowed citations, flag-mode
    feedback enrichment, and strict-mode placeholder pass-through).

## Residual risks

- Claim extraction is still the caller's responsibility.
  `enforceCitationPolicy` receives a pre-split `WritingClaimSpec[]`;
  LLM-driven or fixture-driven extraction continues to live outside the
  evaluator-sdk. The follow-up regression fixtures item and the
  writing-evaluator metadata item will exercise the wiring with
  end-to-end submissions.
- Strict mode raises `EvaluatorRefusal` rather than producing a stored
  `Grade` row. Web/runner callers must catch the refusal and translate it
  into the appropriate "needs revision" UX, mirroring the existing
  `execution_failed` / `evidence_missing` handling.
- Feedback enrichment is a plain-text append today. When the
  writing-evaluator metadata item lands, the enforcement result should
  also be emitted as structured grade metadata (citation policy version,
  per-claim verdict list, redaction status) rather than only as feedback
  text.
- This PR is stacked on PR #38 (writing-claim primitive). Merge order
  must be PR #38 first, then this PR.
