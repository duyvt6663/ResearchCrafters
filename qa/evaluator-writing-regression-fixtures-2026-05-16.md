# QA: Evaluator writing-submission regression fixtures

- Backlog item: `backlog/04-validation-evaluator.md:104` — _Add evaluator
  regression fixtures for strong, weak, overclaiming, citation-missing,
  and prompt-injection writing submissions._
- Section: Validation and Evaluator Backlog > Academic Writing Evaluation
- Workflow item id: `e49d7ea7-46e9-4302-9849-e9089132db40`
- Date: 2026-05-16

## Scope tested

Adds a labeled fixture set that exercises the academic-writing evaluator
end-to-end against the five failure modes named in the backlog item.

- `packages/evaluator-sdk/test/fixtures/writing-submissions.ts`
  - Exports `WRITING_SUBMISSION_FIXTURES` with five entries: `strong`,
    `weak`, `overclaiming`, `citation_missing`, `prompt_injection`.
  - Shared `ALLOWED_EVIDENCE_REFS`, plus `STRICT_POLICY` and
    `PLACEHOLDER_POLICY` `WritingClaimPolicy` shapes for use across
    suites.
  - Each fixture carries `submissionText` (LLM-grader input),
    pre-split `claims` (citation primitive input), `expectedStrictVerdict`
    / `expectedFlagVerdict`, per-claim verdicts keyed by id, optional
    summary substrings, and `forbiddenInGraderOutput` sentinels for the
    redaction battery.
  - `HIDDEN_CANONICAL` + `REDACTION_TARGETS` mirror the math-grader
    adversarial fixture so the writing pipeline catches the same
    classes of leak.
- `packages/evaluator-sdk/test/writing-submissions-regression.test.ts`
  - Pins the fixture set membership (five labels) so future
    renames/removals require a matching test update.
  - For every fixture: strict-mode verdict + refusal payload shape,
    flag-mode verdict + summary substrings, per-claim verdict map.
  - For every fixture: `gradeAttempt` integration. Strict-mode-failing
    fixtures (`weak`, `citation_missing`) must throw
    `EvaluatorRefusal('citation_policy_violation', …)`; the other three
    must complete a grade without refusing. Flag-mode runs prove no
    fixture causes a refusal regardless of citation outcome.
  - Dedicated test for the overclaiming fixture wires a custom scorer
    that demotes the `claim_precision` dimension and pins that the
    pipeline does not pass when the rubric layer rejects overclaim —
    matching the contract that deterministic citation passes are
    necessary but not sufficient.
  - Dedicated tests for the prompt-injection fixture: the user prompt
    wraps the submission inside `<<UNTRUSTED>>` … `<</UNTRUSTED>>`, the
    redactor strips both the literal `HIDDEN_CANONICAL` and the
    glob-pattern leaks (`canonical_*`, `answer_key_*`), and the
    citation primitive still passes because the injection lives in
    prose rather than in the cited refs.

### Coverage matrix

| Fixture | Cited refs allow-listed? | Strict verdict | Flag verdict | Grade pipeline expectation |
| --- | --- | --- | --- | --- |
| `strong` | yes | passed | passed | grade `passed` |
| `weak` | partial (one uncited claim) | failed | passed | strict refuses; flag passes |
| `overclaiming` | yes | passed | passed | rubric scorer must demote; pipeline forwards prose untouched |
| `citation_missing` | no (off allow-list) | failed | passed | strict refuses; flag surfaces refs in summary |
| `prompt_injection` | yes | passed | passed | user prompt wraps in `<<UNTRUSTED>>`; redactor strips canonical leaks |

### Backlog updates

- `backlog/04-validation-evaluator.md:104` — checked off with an
  iteration note pointing at the new fixture/test files.

## Commands run

```
cd packages/evaluator-sdk
pnpm typecheck
npx vitest run test/writing-claims.test.ts test/grade.test.ts test/writing-submissions-regression.test.ts
```

Results:

- `pnpm typecheck` — passes, no diagnostics.
- `npx vitest run …` — `Test Files 3 passed (3) / Tests 62 passed (62)`.
  - `writing-claims.test.ts`: 21 pre-existing tests still green.
  - `grade.test.ts`: 11 pre-existing tests still green.
  - `writing-submissions-regression.test.ts`: 30 new tests covering
    fixture membership, strict-mode and flag-mode citation verdicts,
    per-claim verdict map, `gradeAttempt` strict refusal vs. flag-mode
    pass-through, overclaiming rubric-layer demotion, and the
    prompt-injection delimiter framing + redaction battery.

The package-wide `pnpm test` still has the pre-existing unrelated
failures in `test/derivation.test.ts` and
`test/adversarial-math-grader.test.ts` from earlier in-flight
iterations, as noted in prior QA reports. The new work is verified by
running the affected test files in isolation.

## Residual risks

- The overclaim signal is rubric-layer policy, not a deterministic
  check. The fixture pins that the pipeline forwards the prose to the
  scorer untouched, but catching overclaim still depends on a downstream
  LLM grader or human reviewer scoring `claim_precision`. Adversarial
  grader prompts for the writing path (the LLM-grading-guardrails
  backlog item) are still open.
- Fixtures live under `packages/evaluator-sdk/test/fixtures/`. When
  the writing-evaluator metadata item (`backlog/04-validation-evaluator.md:106`)
  lands its structured grade metadata block, the fixture set should be
  extended with `expectedMetadata` so the regression suite also pins the
  allowed-refs/rubric-version/citation-policy/redaction-status payload.
- The prompt-injection fixture exercises a small adversarial corpus
  (direct override, role-play, delimiter escape) shared with the
  math-grader suite. The wider LLM-grading-guardrails item should
  re-use these fixtures once the package CI gate for adversarial
  grading prompts is wired in.
