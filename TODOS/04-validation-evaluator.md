# Validation and Evaluator TODO

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

## ARA Cross-Link Validation

- [x] Verify ARA mandatory files exist.
- [x] Verify claims link to experiments.
- [x] Verify experiments link to evidence.
- [x] Verify heuristics link to code refs.
- [x] Verify curriculum stages link to valid artifact refs.
- [x] Verify branches link to evidence or declare expert reconstruction.
- [x] Verify `trace/exploration_tree.yaml` nodes reference valid logic, code, and
      evidence ids; flag dangling or duplicate node ids.
- [x] Verify trace nodes that map to curriculum branches use the same id
      convention so trace and curriculum stay aligned.
- [x] Enforce `support_level=explicit` requires non-empty `source_refs`.
- [ ] Enforce claim wording does not exceed cited evidence where possible.

## Sandbox Validation

- [ ] Run starter workspace and confirm target tests fail. _(stubbed)_
- [ ] Run canonical solution and confirm target tests pass. _(stubbed)_
- [ ] Confirm canonical solution passes previous required stages. _(stubbed)_
- [x] Verify all replay fixtures match declared hashes.
- [ ] Verify runner output paths are produced. _(stubbed)_
- [x] Verify no stage requires GPU in MVP.

## Pedagogy Validation

- [x] Ensure every stage has a clear task.
- [x] Ensure every stage has validation mode.
- [x] Ensure every stage has progressive hints.
- [x] Ensure every decision branch has feedback.
- [x] Ensure restricted feedback is hidden until policy allows it.
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
- [ ] Persist deterministic intermediate results so a partial failure can resume
      without re-running upstream checks.

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

- [ ] Add a CI workflow that runs `researchcrafters validate` against every
      package under `content/packages/` on every PR. _(in flight — base CI
      workflow exists at `.github/workflows/ci.yml`; per-package validate
      sweep step pending)_
- [ ] Wire layer-3 sandbox execution to the real runner once Docker is online,
      replacing the current stub that only verifies fixture sha256.
- [ ] Plug the mentor leak-test battery from `packages/ai` into per-package CI.
      _(harness exists in `packages/ai` and
      `packages/content-sdk/src/validator/leak-tests.ts`; CI wiring pending)_
- [ ] Export `runStageLeakTests` and `defaultLeakTestGatewayFactory` from
      `packages/content-sdk/src/index.ts` so the leak-test regression suite and
      downstream package CI can call the harness.
- [ ] Persist evaluator grades through `packages/db` instead of the in-memory
      grade store.
