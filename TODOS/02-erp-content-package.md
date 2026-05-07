# ERP Content Package TODO

Goal: produce one excellent flagship Executable Research Package.

## Paper Selection

- [ ] Choose first paper: FlashAttention or ResNet.
- [ ] Define the core research-engineering skills trained.
- [ ] Confirm the package can run without expensive infrastructure.
- [ ] Identify official paper, code, reproduction resources, talks, blogs, and issue threads.
- [ ] Identify expert reviewer for the package.

## ARA Artifact

- [ ] Create `artifact/PAPER.md`.
- [ ] Create `artifact/logic/problem.md`.
- [ ] Create `artifact/logic/claims.md`.
- [ ] Create `artifact/logic/concepts.md`.
- [ ] Create `artifact/logic/experiments.md`.
- [ ] Create `artifact/logic/solution/architecture.md`.
- [ ] Create `artifact/logic/solution/algorithm.md`.
- [ ] Create `artifact/logic/solution/constraints.md`.
- [ ] Create `artifact/logic/solution/heuristics.md`.
- [ ] Create `artifact/logic/related_work.md`.
- [ ] Create `artifact/src/configs/`.
- [ ] Create `artifact/src/execution/`.
- [ ] Create `artifact/src/environment.md`.
- [ ] Create `artifact/trace/exploration_tree.yaml`.
- [ ] Create `artifact/evidence/README.md`.
- [ ] Add evidence tables, figures, logs, or cached outputs.

## Curriculum Graph

- [ ] Create `curriculum/graph.yaml`.
- [ ] Add 8-12 initial stages.
- [ ] Include stage types: framing, decision, implementation, experiment, analysis, writing, reflection.
- [ ] Include at least one failed branch.
- [ ] Include at least one suboptimal or ambiguous branch.
- [ ] Mark each branch support level: explicit, inferred, or expert_reconstructed.
- [ ] Ensure every explicit node has non-empty `source_refs`.
- [ ] Ensure every branch cites evidence or declares expert reconstruction.

## Stage Content

- [ ] Create stage markdown files under `curriculum/stages/`.
- [ ] Add progressive hints under `curriculum/hints/`.
- [ ] Add rubrics under `curriculum/rubrics/`.
- [ ] Add `stage_policy` for every stage.
- [ ] Add runner mode for every executable stage.
- [ ] Add `safety.redaction_targets` for LLM mentor or grading stages.
- [ ] Write expert branch feedback for every decision branch.
- [ ] Write canonical feedback and common misconception notes.

## Workspace

- [ ] Create `workspace/starter/`.
- [ ] Create `workspace/tests/`.
- [ ] Create `workspace/fixtures/`.
- [ ] Create `workspace/runner.yaml`.
- [ ] Declare fixture hashes as `{path, sha256}`.
- [ ] Create `solutions/canonical/`.
- [ ] Create branch solution notes or examples under `solutions/branches/`.
- [ ] Ensure starter fails target tests.
- [ ] Ensure canonical solution passes target and previous required stages.

## Cached Evidence and Fixture Acquisition

Replay-mode stages run against precomputed outputs because the original experiment
is too expensive to repeat per submission. The fixtures must be produced once on
trusted hardware before the package can ship.

- [ ] Identify experiments whose outputs replay-mode stages depend on.
- [ ] Identify hardware needed: GPU type, memory, software versions.
- [ ] Run each canonical experiment on appropriate hardware; capture outputs.
- [ ] Run each documented branch experiment that has supporting evidence so failed
      and suboptimal branches are reproducible by the package author.
- [ ] Store outputs under `workspace/fixtures/<stage_id>/` with provenance:
      hardware, command, environment, git SHA, and date.
- [ ] Compute and record `sha256` hashes in `runner.yaml`.
- [ ] Document the regeneration recipe in `workspace/fixtures/README.md` so a
      maintainer can rebuild fixtures when libraries or hardware change.
- [ ] Add a CI assertion that recorded hashes match the files committed.
- [ ] Decide a fixture refresh cadence and record it in package metadata.

## Review Gates

- [ ] Run `researchcrafters validate`.
- [ ] Run mentor leak tests.
- [ ] Run evaluator leak tests.
- [ ] Run redaction checks.
- [ ] Expert reviewer checks evidence calibration.
- [ ] Expert reviewer checks branch fairness.
- [ ] Expert reviewer checks rubric quality.
- [ ] Alpha cohort completes package and reports confusing stages.

## Acceptance Criteria

- [ ] Package validates structurally and semantically.
- [ ] Package has at least one instructive failed or suboptimal branch.
- [ ] Package has at least one implementation stage, one experiment/evidence stage, and one writing stage.
- [ ] A serious learner can finish the preview without setup friction.
- [ ] The flagship package is strong enough to anchor launch messaging.
