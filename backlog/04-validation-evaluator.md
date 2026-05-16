# Validation and Evaluator Backlog

Goal: make ERP quality and learner grading testable, auditable, and safe.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

## Package Validator

- [x] Implement `researchcrafters validate`.
- [x] Validate `package.yaml`.
- [x] Validate `curriculum/graph.yaml`.
- [x] Validate stage schemas.
- [x] Validate branch schemas.
- [x] Validate rubric schemas.
- [x] Validate hint schemas.
- [x] Validate `workspace/runner.yaml`.
- [x] Validate `safety.redaction_targets` when LLM mentor or LLM grading is enabled.
      _(Iteration 5 landed: `packageSchema` now declares
      `safety.redaction_targets`
      (`packages/erp-schema/src/schemas/package.ts`); leak-test harness
      unions package-level + per-stage `mentor_redaction_targets`
      (`packages/content-sdk/src/validator/leak-tests.ts`).)_

## ARA Cross-Link Validation

- [x] Verify ARA mandatory files exist.
- [x] Verify claims link to experiments.
- [x] Verify experiments link to evidence.
- [x] Verify heuristics link to code refs.
- [x] Verify curriculum stages link to valid artifact refs.
- [x] Verify branches link to evidence or declare expert reconstruction.
- [x] Verify `trace/exploration_tree.yaml` nodes reference valid logic, code,
      evidence ids, branch ids, parent ids, and edge endpoints; flag dangling or
      duplicate node ids. _(`validateAraCrossLink` two-pass walk validates ids,
      refs, parents, string children, branch_id against curriculum branches,
      and top-level edge endpoints; flags self-references and self-loops.)_
- [x] Verify trace nodes that map to curriculum branches use the same id
      convention so trace and curriculum stay aligned.
      _(`validateAraCrossLink` third pass enforces a 1:1 mapping between
      `kind: branch` trace nodes and curriculum branch ids: emits
      `trace.branch_id.duplicate` (error) when two trace branch nodes claim
      the same `branch_id`, and `trace.branch.unmapped` (warning) when a
      curriculum branch has no corresponding trace branch node.)_
- [x] Enforce `support_level=explicit` requires non-empty `source_refs`.
- [ ] Enforce claim wording does not exceed cited evidence where possible.

## Sandbox Validation

- [ ] Run starter workspace and confirm target tests fail. _(stubbed)_
- [ ] Run canonical solution and confirm target tests pass. _(stubbed)_
- [x] Confirm canonical solution passes previous required stages.
      _(static deterministic portion landed: `derivePrereqsPlans`
      walks the curriculum graph backwards over `unlocks` +
      `unlocks_by_choice`, filters to runner-gated stages, and
      `validateSandbox` emits `sandbox.canonical.prereqs.plan` per
      runner-gated stage plus a `sandbox.canonical.missing` warning
      when runner-gated stages exist but `solutions/canonical/` is
      empty. The Docker-backed pass that actually runs canonical
      against each prior stage and asserts exit 0 is tracked under
      "Wire layer-3 sandbox execution to the real runner once Docker
      is online.")_
- [x] Verify all replay fixtures match declared hashes.
- [x] Verify runner output paths are produced. _(static deterministic
      portion landed: `validateSandbox` emits
      `sandbox.output_paths.plan` per runner-gated stage, warns
      `sandbox.output_paths.missing` when a runner-gated stage has no
      declared outputs, and errors `sandbox.output_paths.invalid` when
      an entry is absolute or escapes the package. The Docker-backed
      executor that asserts the files actually exist after a run is
      tracked under "Wire layer-3 sandbox execution to the real runner
      once Docker is online.")_
- [x] Verify no stage requires GPU in MVP.

## Pedagogy Validation

- [x] Ensure every stage has a clear task.
- [x] Ensure every stage has validation mode.
- [x] Ensure every stage has progressive hints.
- [x] Ensure every decision branch has feedback.
- [x] Ensure restricted feedback is hidden until policy allows it.
- [ ] Ensure math modules include at least one checkable reasoning artifact:
      derivation step, shape table, numeric answer, counterexample, or proof
      critique.
- [x] Ensure writing modules include evidence constraints, citation policy,
      rubric dimensions, and revision behavior.
- [ ] Ensure first 2 stages can be completed quickly.

## Evaluator Service

- [x] Define grade schema.
- [x] Parse runner artifacts and metrics.
- [x] Parse web-only learner answers.
- [x] Apply rubric thresholds.
- [x] Produce structured dimension scores.
- [x] Produce pass/fail or partial-credit result.
- [x] Store evidence references used in grading.
- [x] Store model metadata when LLM grading is used.
- [x] Refuse to grade if required evidence links are missing.
- [x] Refuse to grade unless `execution_status=ok` for executable stages.
- [x] Make grading idempotent: deduplicate by `(submission_id, rubric_version,
      evaluator_version)`; reuse the existing grade on retry instead of
      regenerating.
- [x] Persist deterministic intermediate results so a partial failure can resume
      without re-running upstream checks.

## Math Evaluation

- [x] Add deterministic numeric checks with tolerance and unit/shape metadata.
      _(Iteration: `packages/evaluator-sdk/src/numeric.ts` exposes
      `checkNumeric`/`checkNumericBatch` with absolute+relative tolerance
      (numpy-isclose semantics), unit equality, scalar/vector/tensor shape
      inference and shape-table gating, and a `metricsToObservations`
      adapter for `RunArtifacts.metrics`. Public types and helpers are
      re-exported from `packages/evaluator-sdk/src/index.ts`.)_
- [x] Add shape-table and memory/complexity checks for implementation-linked
      math stages.
- [ ] Add per-step partial credit for derivation modules.
- [x] Add rubric fallback for proof outlines, counterexamples, and conceptual
      explanations.
- [ ] Add adversarial grader tests for math stages that try to extract
      canonical derivations.

## Academic Writing Evaluation

- [ ] Add rubric dimensions for claim precision, evidence grounding, caveat
      discipline, contribution framing, citation hygiene, reproducibility
      detail, and concision.
- [x] Reject or flag unsupported claims that cite no allowed evidence ref.
      _(Iteration: `packages/evaluator-sdk/src/writing-claims.ts` adds the
      deterministic primitive `checkWritingClaim` /
      `checkWritingClaimBatch` plus stage-level composition
      `enforceCitationPolicy` and the `extractCitationRefs` bracket
      helper. Per-claim verdicts surface `{ passed, flagged, reason,
      acceptedRefs, disallowedRefs, placeholderRefs }` with reason codes
      `no_citation`, `disallowed_citation`, `placeholder_disallowed`,
      `spec_invalid`. The primitive is intentionally not wired into
      `gradeAttempt`/`llmGrade` yet — citation-policy enforcement is the
      next item below.)_
- [x] Enforce citation policy: verified allowed citations only, or explicit
      placeholders where the stage allows placeholders.
      _(Iteration: `packages/evaluator-sdk/src/writing-claims.ts` adds
      `enforceCitationPolicy(claims, policy, { mode })` with `strict` and
      `flag` modes; `gradeAttempt` accepts a `citationPolicy` block that
      refuses with `EvaluatorRefusal('citation_policy_violation', …)` in
      strict mode and appends a feedback summary in flag mode. Placeholder
      tokens honored only when the stage policy opts in. QA report:
      `qa/evaluator-citation-policy-enforcement-2026-05-16.md`.)_
- [ ] Add evaluator regression fixtures for strong, weak, overclaiming,
      citation-missing, and prompt-injection writing submissions.
- [x] Emit writing-evaluator metadata for allowed evidence refs, rubric
      version, citation policy, and redaction status.
      _(Iteration: `packages/evaluator-sdk/src/types.ts` adds
      `WritingEvaluatorMetadata` and `Grade.writingEvaluator`;
      `gradeAttempt` (`src/grade.ts`) builds the block from the citation
      policy snapshot (mode, verdict, allowedEvidenceRefs,
      placeholderTokens, placeholderAllowed, claim totals) and a new
      `redaction: { triggered, targets, matchedTargets? }` input. The
      block is attached only when a writing-evaluator surface
      (citationPolicy or redaction) is exercised so non-writing grades
      are unchanged. QA report:
      `qa/evaluator-writing-metadata-2026-05-16.md`.)_

## Human Override

- [ ] Add a reviewer-only endpoint to override a grade.
- [x] Require an override reason and reviewer identity.
- [x] Append overrides to the `grades` row history rather than overwriting.
- [ ] Surface overrides to the learner with the reviewer note.
- [ ] Emit a telemetry event for every override.

## LLM Grading Guardrails

- [x] Use rubric criteria and allowed evidence only.
- [x] Never include raw `solutions/canonical/` text in grading prompts.
- [x] Quote learner submission inside an untrusted delimiter.
- [x] Instruct grader to ignore learner-provided instructions.
- [ ] Run adversarial grading prompts in package CI.
- [x] Fail validation if canonical text or hidden keys leak.
- [x] Apply redaction targets to grader output before storage/display.
- [x] Apply the same redaction pass to mentor messages that quote evaluator
      output, so leaked text cannot escape through the mentor channel.
- [ ] Emit `evaluator_redaction_triggered` when redaction fires.
- [ ] Flag redacted attempts for review.

## Acceptance Criteria

- [x] Package cannot publish unless validation layers 1-4 pass.
- [x] Evaluator and runner ownership is clearly separated in code.
- [x] LLM grading cannot reveal hidden answers through learner prompt injection.
- [x] Grades are explainable and tied to rubric dimensions.

## Open gaps from snapshot

- [x] Add a CI workflow that runs `researchcrafters validate` against every
      package under `content/packages/` on every PR.
- [ ] Wire leak tests and non-stub sandbox validation into the same package CI
      gate.
- [ ] Wire layer-3 sandbox execution to the real runner once Docker is online,
      replacing the current stub that only verifies fixture sha256.
- [ ] Plug the mentor leak-test battery from `packages/ai` into per-package CI.
      _(harness exists in `packages/ai` and
      `packages/content-sdk/src/validator/leak-tests.ts`; CI wiring pending)_
- [x] Export `runStageLeakTests` and `defaultLeakTestGatewayFactory` from
      `packages/content-sdk/src/index.ts` so the leak-test regression suite and
      downstream package CI can call the harness.
- [ ] Persist evaluator grades through `packages/db` instead of the in-memory
      grade store.
- [ ] Define a typed trace graph schema and build output so
      `buildPackageManifest` can expose a compiled experiment tree payload for
      the web UI.
- [x] Add `package.safety` (`safetySchema`) to `packageSchema` and union
      `package.safety.redaction_targets` with `stage_policy.mentor_redaction_targets`
      when collecting leak-test targets. _(Iteration 5 landed.)_
- [x] Capture `mentor_leak_tests[*].must_not_contain` (and optional `id` /
      `category`) on the stage schema; have the leak-test harness check
      each authored attack against its own list. _(Iteration 5 landed —
      `packages/erp-schema/src/schemas/stage.ts` declares
      `must_not_contain`; harness consumes per-attack lists.)_
- [x] Compose authored leak-test attacks as a UNION with the default
      battery, not OR (was `authoredAttacks(stage) ?? DEFAULT_ATTACKS`,
      replacing the 5 defaults; now
      `[...DEFAULT_ATTACKS, ...authored]` with id-dedupe at
      `packages/content-sdk/src/validator/leak-tests.ts`). _(Iteration 5.)_
- [x] Surface dropped stage fields (`node_id`, `source_refs`,
      `evidence_refs`, `validation.test_path`, `inputs.fields`,
      `runner.fixtures`) either via schema extension or structural warnings.
      _(Iteration 5: 6 fields surfaced.)_
