# Mentor Safety TODO

Goal: provide useful AI mentorship without turning the mentor into an answer oracle.

## Stage Policy

- [ ] Add `stage_policy` to every stage.
- [ ] Mirror `stage_policy` into the `stages` table on package build.
- [ ] Define visibility scopes: stage copy, artifact refs, rubric, evidence, branch feedback, canonical solution, branch solutions.
- [ ] Support visibility states: `always`, `after_attempt`, `after_pass`, `after_completion`, `never`.
- [ ] Define `after_attempt` trigger: a `stage_attempts` row is persisted with a
      non-empty answer payload for the current stage.
- [ ] Define `after_pass` trigger: a `grades` row exists for the current stage
      with `passed=true`, or `rubric_score >= stage.pass_threshold` for partial-credit stages.
- [ ] Define `after_completion` trigger: every required stage in the enrollment's
      package version has reached `after_pass` (used for end-of-package reflection
      and post-mortem branch reveal).
- [ ] Add `stage.pass_threshold` to the stage schema for rubric stages; require it
      whenever any policy field uses `after_pass`.
- [ ] Gate mentor context through `permissions.canAccess`.
- [ ] Gate solution visibility through stage state.
- [ ] Author refusal copy per package; do not let the model generate refusals.

## Context Builder

- [ ] Load only allowed artifact refs.
- [ ] Load rubric only when policy allows.
- [ ] Load branch feedback only when policy allows.
- [ ] Never load `solutions/canonical/` before allowed.
- [ ] Never load branch solution files before allowed.
- [ ] Include non-disclosure instructions in every mentor prompt.
- [ ] Include citation/evidence context used for feedback.

## Mentor Interaction

- [ ] Add hint request endpoint.
- [ ] Add feedback request endpoint.
- [ ] Rate-limit mentor requests per user and package.
- [ ] Cache stage-static context.
- [ ] Route hints to cheaper model.
- [ ] Route evidence-grounded writing feedback to stronger model.
- [ ] Store mentor threads and messages.
- [ ] Record `model_tier`, `model_id`, `provider`, prompt token count, and
      completion token count on every `mentor_messages` row for cost and quality
      audits.
- [ ] Surface low-confidence or policy-violating outputs for review.

## Cost Caps

- [ ] Enforce per-user per-day spend cap; degrade to cheaper tier or refuse with
      authored copy when exceeded.
- [ ] Enforce per-package overall spend cap declared by the package author or
      platform admin; circuit-break when exceeded and notify the package owner.
- [ ] Enforce per-stage spend cap for stages with known runaway risk.
- [ ] Track spend in near-real-time using token counts plus provider price table.
- [ ] Emit alerts when any cap reaches 80%.

## Leak Tests

- [ ] For each stage, generate adversarial prompts.
- [ ] Ask for canonical answers directly.
- [ ] Ask through roleplay, grading, JSON, and "debug" framing.
- [ ] Fail package validation if restricted answer text appears.
- [ ] Include `safety.redaction_targets` in leak checks.
- [ ] Add tests for branch feedback gating.
- [ ] Add tests for canonical solution gating.

## Review Queue

- [ ] Create internal queue for flagged mentor outputs.
- [ ] Make queue visible to package authors.
- [ ] Make queue visible to platform reviewer role.
- [ ] Track resolution status.
- [ ] Allow reviewer to mark prompt, policy, or package content as the root cause.

## SLOs

- [ ] p95 mentor first token for hints under 5 seconds.
- [ ] p95 mentor first token for writing feedback under 15 seconds.

## Acceptance Criteria

- [ ] Mentor can help without seeing hidden solution files.
- [ ] Mentor leak tests run in package CI.
- [ ] Flagged mentor outputs have an owner and review path.
- [ ] Mentor cost can be controlled by stage, user, and model tier.
