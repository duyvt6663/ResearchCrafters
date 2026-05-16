# QA — Pedagogy validator: writing-module contract

- Backlog item: `[backlog/04-validation-evaluator.md:63]` — Ensure writing
  modules include evidence constraints, citation policy, rubric dimensions,
  and revision behavior.
- Status: PASS.

## Scope tested

Adds four writing-module checks to `validatePedagogy` for stages with
`type: writing`:

1. `stage.writing.evidence_constraints.missing` (error) — fires when both
   `evidence_refs` and `source_refs` are empty.
2. `stage.writing.citation_policy.unspecified` (warning) — fires when
   `task.prompt_md` mentions none of `cite | citation | reference | evidence`.
3. `stage.writing.rubric.{missing,unresolved,no_dimensions}` (error) — fires
   when `validation.kind` is not `rubric|hybrid`, the linked rubric ref is
   missing, the rubric does not resolve, or it has zero dimensions.
4. `stage.writing.revision_behavior.missing` (warning) — fires when none of
   `feedback.canonical_md`, `feedback.common_misconceptions`, or
   `hints.progressive` is set, so the learner has no signal to revise from.

## Commands run

- `cd packages/content-sdk && pnpm test -- --run validator` → 22/22 pass
  (includes 6 new writing-module tests covering positive + each negative
  branch).
- `cd packages/content-sdk && pnpm test -- --run` → 35/35 pass across
  `validator.test.ts` and `leak-tests.test.ts`.
- `cd packages/content-sdk && pnpm build` → clean `tsc`.
- `node -e "validatePedagogy(loadPackage('content/packages/resnet'), {skipLeakTests:true})"`
  → 0 writing-stage issues, 0 errors, 0 warnings across S006 + S007R.
- `node packages/cli/dist/index.js validate content/packages/resnet` → exit 0.

## Files changed

- `packages/content-sdk/src/validator/pedagogy.ts` — adds the four writing
  checks inside the per-stage loop.
- `packages/content-sdk/test/validator.test.ts` — adds
  `validatePedagogy writing-module contract` describe block (6 tests).

## Risks / follow-ups

- Citation-policy check is a textual heuristic on `task.prompt_md`. An author
  could spell it differently (e.g. "anchor" instead of "cite"); the check
  errs on a warning, not an error, to avoid blocking publish on phrasing.
- Revision-behavior check accepts any of three signals. A future iteration
  could require the linked progressive-hints file actually contains
  revision-oriented hints, but that crosses into content-quality territory
  outside this backlog item's scope.
- The `Academic Writing Evaluation` rubric-dimension catalog (claim precision,
  evidence grounding, caveat discipline, contribution framing, citation
  hygiene, reproducibility detail, concision) is tracked separately in
  `backlog/04-validation-evaluator.md` lines 99–110 and intentionally not
  asserted here — this item is the structural pedagogy gate, not the
  evaluator-side rubric catalog.
