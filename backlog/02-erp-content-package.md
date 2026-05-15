# ERP Content Package Backlog

Goal: produce one excellent flagship Executable Research Package.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

## Paper Selection

- [x] Choose first paper: FlashAttention or ResNet.
- [x] Define the core research-engineering skills trained.
- [x] Confirm the package can run without expensive infrastructure.
- [x] Identify official paper, code, reproduction resources, talks, blogs, and issue threads.
- [ ] Identify expert reviewer for the package.

## ARA Artifact

- [x] Create `artifact/PAPER.md`.
- [x] Create `artifact/logic/problem.md`.
- [x] Create `artifact/logic/claims.md`.
- [x] Create `artifact/logic/concepts.md`.
- [x] Create `artifact/logic/experiments.md`.
- [x] Create `artifact/logic/solution/architecture.md`.
- [x] Create `artifact/logic/solution/algorithm.md`.
- [x] Create `artifact/logic/solution/constraints.md`.
- [x] Create `artifact/logic/solution/heuristics.md`.
- [x] Create `artifact/logic/related_work.md`.
- [x] Create `artifact/src/configs/`.
- [x] Create `artifact/src/execution/`.
- [x] Create `artifact/src/environment.md`.
- [x] Create `artifact/trace/exploration_tree.yaml`.
- [x] Create `artifact/evidence/README.md`.
- [x] Add evidence tables, figures, logs, or cached outputs.

## Curriculum Graph

- [x] Create `curriculum/graph.yaml`.
- [x] Add 8-12 initial stages.
- [x] Include stage types: framing, math, decision, implementation, experiment,
      analysis, writing, review, reflection.
- [x] Include at least one failed branch.
- [x] Include at least one suboptimal or ambiguous branch.
- [x] Mark each branch support level: explicit, inferred, or expert_reconstructed.
- [x] Ensure every explicit node has non-empty `source_refs`.
- [x] Ensure every branch cites evidence or declares expert reconstruction.

## Stage Content

- [x] Create stage markdown files under `curriculum/stages/`.
- [x] Add progressive hints under `curriculum/hints/`.
- [x] Add rubrics under `curriculum/rubrics/`.
- [x] Add `stage_policy` for every stage.
- [x] Add runner mode for every executable stage.
- [x] Add `safety.redaction_targets` for LLM mentor or grading stages.
      _(Iteration 5 landed: `packageSchema` now declares `safety` with
      `redaction_targets`, and the leak-test harness unions
      `package.safety.redaction_targets` with each stage's
      `mentor_redaction_targets`.)_
- [x] Write expert branch feedback for every decision branch.
- [x] Write canonical feedback and common misconception notes.

## Workspace

- [x] Create `workspace/starter/`. _(stubbed)_
- [x] Create `workspace/tests/`.
- [x] Create `workspace/fixtures/`. _(stubbed)_
- [x] Create `workspace/runner.yaml`.
- [x] Declare fixture hashes as `{path, sha256}`.
- [x] Create `solutions/canonical/`. _(stubbed)_
- [x] Create branch solution notes or examples under `solutions/branches/`.
- [ ] Ensure starter fails target tests.
- [ ] Ensure canonical solution passes target and previous required stages.

## Cached Evidence and Fixture Acquisition

Replay-mode stages run against precomputed outputs because the original experiment
is too expensive to repeat per submission. The fixtures must be produced once on
trusted hardware before the package can ship.

- [x] Identify experiments whose outputs replay-mode stages depend on.
- [x] Identify hardware needed: GPU type, memory, software versions.
- [ ] Run each canonical experiment on appropriate hardware; capture outputs.
- [ ] Run each documented branch experiment that has supporting evidence so failed
      and suboptimal branches are reproducible by the package author.
- [ ] Store outputs under `workspace/fixtures/<stage_id>/` with provenance:
      hardware, command, environment, git SHA, and date. _(stubbed)_
- [x] Compute and record `sha256` hashes in `runner.yaml`.
- [x] Document the regeneration recipe in `workspace/fixtures/README.md` so a
      maintainer can rebuild fixtures when libraries or hardware change.
- [x] Add a CI assertion that recorded hashes match the files committed.
- [ ] Decide a fixture refresh cadence and record it in package metadata.

## Review Gates

- [x] Run `researchcrafters validate`.
- [x] Run mentor leak tests.
- [x] Run evaluator leak tests.
- [x] Run redaction checks.
- [ ] Expert reviewer checks evidence calibration.
- [ ] Expert reviewer checks branch fairness.
- [ ] Expert reviewer checks rubric quality.
- [ ] Alpha cohort completes package and reports confusing stages.

## Acceptance Criteria

- [x] Package validates structurally and semantically.
- [x] Package has at least one instructive failed or suboptimal branch.
- [x] Package has at least one implementation stage, one experiment/evidence
      stage, one math stage, and one writing stage.
- [ ] A serious learner can finish the preview without setup friction.
- [ ] The flagship package is strong enough to anchor launch messaging.

## Open gaps from snapshot

- [ ] Replace placeholder `workspace/fixtures/stage-004/training_log.json` and
      `_meta.provenance` "PLACEHOLDER" fields with a real ResNet experiment run.
- [ ] Replace stub starter and canonical Python files with working models.
- [ ] Recompute `sha256` after regenerating the fixture and update `runner.yaml`.
- [ ] Assign expert reviewer; populate `review.last_reviewed_at`.
- [ ] Run beta cohort review of the flagship package.
- [ ] Author a second package (FlashAttention or DPO).
- [ ] Upgrade `S001M` from a free-text math prompt into the interactive math
      module described in `11-learning-modules-math-writing.md`.
- [ ] Upgrade `S006` from a single claim-writing prompt into an academic
      writing module with claim surgery, evidence mapping, and revision.
- [ ] Add a reviewer-rebuttal micro-stage after `S007` so the writing track
      includes argument under reviewer pressure, not only claim drafting.
- [x] Lengthen S004 redaction target `"0.03"` to a contextualized phrase
      (e.g. `"degradation gap of 0.03"`); add per-trajectory finals
      (`0.06`, `0.08`, `0.05`) to `mentor_redaction_targets` so the harness
      can catch fixture leaks today instead of only via the dropped
      per-attack `must_not_contain` lists. _(Iteration 2 + iteration 5:
      bare `"0.03"` removed; 11 contextualized phrases now in
      `content/packages/resnet/curriculum/stages/004-cifar10-replay.yaml`
      including per-trajectory finals (`"residual-56: 0.030"`,
      `"plain-56: 0.080"` etc.), `"degradation gap"`, `"depth 56
      degradation"`, and the arithmetic identity
      `"0.080 - 0.060 = 0.020"`. `must_not_contain` per-attack lists are
      now plumbed through the schema and harness.)_
