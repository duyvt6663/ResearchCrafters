# Validation and Evaluator TODO

Goal: make ERP quality and learner grading testable, auditable, and safe.

## Package Validator

- [ ] Implement `researchcrafters validate`.
- [ ] Validate `package.yaml`.
- [ ] Validate `curriculum/graph.yaml`.
- [ ] Validate stage schemas.
- [ ] Validate branch schemas.
- [ ] Validate rubric schemas.
- [ ] Validate hint schemas.
- [ ] Validate `workspace/runner.yaml`.
- [ ] Validate `safety.redaction_targets` when LLM mentor or LLM grading is enabled.

## ARA Cross-Link Validation

- [ ] Verify ARA mandatory files exist.
- [ ] Verify claims link to experiments.
- [ ] Verify experiments link to evidence.
- [ ] Verify heuristics link to code refs.
- [ ] Verify curriculum stages link to valid artifact refs.
- [ ] Verify branches link to evidence or declare expert reconstruction.
- [ ] Verify `trace/exploration_tree.yaml` nodes reference valid logic, code, and
      evidence ids; flag dangling or duplicate node ids.
- [ ] Verify trace nodes that map to curriculum branches use the same id
      convention so trace and curriculum stay aligned.
- [ ] Enforce `support_level=explicit` requires non-empty `source_refs`.
- [ ] Enforce claim wording does not exceed cited evidence where possible.

## Sandbox Validation

- [ ] Run starter workspace and confirm target tests fail.
- [ ] Run canonical solution and confirm target tests pass.
- [ ] Confirm canonical solution passes previous required stages.
- [ ] Verify all replay fixtures match declared hashes.
- [ ] Verify runner output paths are produced.
- [ ] Verify no stage requires GPU in MVP.

## Pedagogy Validation

- [ ] Ensure every stage has a clear task.
- [ ] Ensure every stage has validation mode.
- [ ] Ensure every stage has progressive hints.
- [ ] Ensure every decision branch has feedback.
- [ ] Ensure restricted feedback is hidden until policy allows it.
- [ ] Ensure first 2 stages can be completed quickly.

## Evaluator Service

- [ ] Define grade schema.
- [ ] Parse runner artifacts and metrics.
- [ ] Parse web-only learner answers.
- [ ] Apply rubric thresholds.
- [ ] Produce structured dimension scores.
- [ ] Produce pass/fail or partial-credit result.
- [ ] Store evidence references used in grading.
- [ ] Store model metadata when LLM grading is used.
- [ ] Refuse to grade if required evidence links are missing.
- [ ] Refuse to grade unless `execution_status=ok` for executable stages.
- [ ] Make grading idempotent: deduplicate by `(submission_id, rubric_version,
      evaluator_version)`; reuse the existing grade on retry instead of
      regenerating.
- [ ] Persist deterministic intermediate results so a partial failure can resume
      without re-running upstream checks.

## Human Override

- [ ] Add a reviewer-only endpoint to override a grade.
- [ ] Require an override reason and reviewer identity.
- [ ] Append overrides to the `grades` row history rather than overwriting.
- [ ] Surface overrides to the learner with the reviewer note.
- [ ] Emit a telemetry event for every override.

## LLM Grading Guardrails

- [ ] Use rubric criteria and allowed evidence only.
- [ ] Never include raw `solutions/canonical/` text in grading prompts.
- [ ] Quote learner submission inside an untrusted delimiter.
- [ ] Instruct grader to ignore learner-provided instructions.
- [ ] Run adversarial grading prompts in package CI.
- [ ] Fail validation if canonical text or hidden keys leak.
- [ ] Apply redaction targets to grader output before storage/display.
- [ ] Apply the same redaction pass to mentor messages that quote evaluator
      output, so leaked text cannot escape through the mentor channel.
- [ ] Emit `evaluator_redaction_triggered` when redaction fires.
- [ ] Flag redacted attempts for review.

## Acceptance Criteria

- [ ] Package cannot publish unless validation layers 1-4 pass.
- [ ] Evaluator and runner ownership is clearly separated in code.
- [ ] LLM grading cannot reveal hidden answers through learner prompt injection.
- [ ] Grades are explainable and tied to rubric dimensions.
