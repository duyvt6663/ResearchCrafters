# Mentor Safety Backlog

Goal: provide useful AI mentorship without turning the mentor into an answer oracle.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

## Stage Policy

- [x] Add `stage_policy` to every stage.
- [x] Mirror `stage_policy` into the `stages` table on package build.
- [x] Define visibility scopes: stage copy, artifact refs, rubric, evidence, branch feedback, canonical solution, branch solutions.
- [x] Support visibility states: `always`, `after_attempt`, `after_pass`, `after_completion`, `never`.
- [x] Define `after_attempt` trigger: a `stage_attempts` row is persisted with a
      non-empty answer payload for the current stage.
- [x] Define `after_pass` trigger: a `grades` row exists for the current stage
      with `passed=true`, or `rubric_score >= stage.pass_threshold` for partial-credit stages.
- [x] Define `after_completion` trigger: every required stage in the enrollment's
      package version has reached `after_pass` (used for end-of-package reflection
      and post-mortem branch reveal).
- [x] Add `stage.pass_threshold` to the stage schema for rubric stages; require it
      whenever any policy field uses `after_pass`.
- [x] Gate mentor context through `permissions.canAccess`.
- [x] Gate solution visibility through stage state.
- [ ] Author refusal copy per package; do not let the model generate refusals. _(stubbed)_

## Context Builder

- [x] Load only allowed artifact refs.
- [x] Load rubric only when policy allows.
- [x] Load branch feedback only when policy allows.
- [x] Never load `solutions/canonical/` before allowed.
- [x] Never load branch solution files before allowed.
- [x] Include non-disclosure instructions in every mentor prompt.
- [x] Include citation/evidence context used for feedback.

## Mentor Interaction

- [x] Add hint request endpoint.
- [x] Add feedback request endpoint.
- [ ] Rate-limit mentor requests per user and package. _(stubbed)_
- [ ] Cache stage-static context.
- [x] Route hints to cheaper model.
- [x] Route evidence-grounded writing feedback to stronger model.
- [x] Store mentor threads and messages. _(persisted via Prisma in
      `apps/web/lib/mentor-runtime.ts`; `MentorThread` + `MentorMessage`
      rows are written from `/api/mentor/messages`.)_
- [x] Record `model_tier`, `model_id`, `provider`, prompt token count, and
      completion token count on every `mentor_messages` row for cost and quality
      audits.
- [ ] Surface low-confidence or policy-violating outputs for review.

## Cost Caps

- [x] Enforce per-user per-day spend cap; degrade to cheaper tier or refuse with
      authored copy when exceeded. _(stubbed)_
- [x] Enforce per-package overall spend cap declared by the package author or
      platform admin; circuit-break when exceeded and notify the package owner. _(stubbed)_
- [x] Enforce per-stage spend cap for stages with known runaway risk. _(stubbed)_
- [ ] Track spend in near-real-time using token counts plus provider price table.
- [ ] Emit alerts when any cap reaches 80%.

## Leak Tests

- [x] For each stage, generate adversarial prompts.
- [x] Ask for canonical answers directly.
- [x] Ask through roleplay, grading, JSON, and "debug" framing.
      _(Iteration 5 landed: authored attacks now UNION the
      `DEFAULT_ATTACKS` battery (`[...DEFAULT_ATTACKS, ...authored]`
      with id-dedupe) at
      `packages/content-sdk/src/validator/leak-tests.ts`.)_
- [x] Fail package validation if restricted answer text appears.
- [x] Include `safety.redaction_targets` in leak checks.
      _(Iteration 5 landed: `package.safety.redaction_targets` declared
      on `packageSchema` and unioned with each stage's
      `mentor_redaction_targets` by the leak-test harness.)_
- [x] Add tests for branch feedback gating.
- [x] Add tests for canonical solution gating.

## Review Queue

- [ ] Create internal queue for flagged mentor outputs.
- [ ] Make queue visible to package authors.
- [ ] Make queue visible to platform reviewer role.
- [ ] Track resolution status.
- [ ] Allow reviewer to mark prompt, policy, or package content as the root cause.

## SLOs

- [x] p95 mentor first token for hints under 5 seconds.
      _(landed: `apps/web/lib/mentor-runtime.ts` times every
      `gateway.complete(...)` call and emits a
      `mentor_first_token_latency` telemetry event tagged with
      `mode: "hint"`, `modelTier`, `modelId`, `latencyMs`,
      `sloMs: 5000`, and a per-request `withinSlo` boolean.
      `MENTOR_FIRST_TOKEN_SLO_MS` exports the authored thresholds.
      The gateway is non-streaming today, so `latencyMs` is the
      completion duration; when streaming lands the same start marker
      pairs with the first-chunk timestamp without changing the event
      shape. Dashboards compute p95 directly from this stream.)_
- [x] p95 mentor first token for writing feedback under 15 seconds.
      _(landed: same emission as the hint SLO, but for
      `mode: "feedback"` requests (`clarify` and `review_draft`) with
      `sloMs: 15000`. See `mentor_first_token_latency` in
      `packages/telemetry/src/events.ts`.)_

## Acceptance Criteria

- [x] Mentor can help without seeing hidden solution files.
- [ ] Mentor leak tests run in package CI.
- [ ] Flagged mentor outputs have an owner and review path.
- [x] Mentor cost can be controlled by stage, user, and model tier.

## Open gaps from snapshot

- [ ] Author the per-package refusal copy in `@researchcrafters/ui/copy`;
      `getAuthoredRefusal` currently returns placeholder strings.
- [ ] Wire production `SpendStore` and `RateLimiter` implementations from the web
      app rather than relying on the interfaces shipped in `packages/ai`.
- [ ] Surface per-package mentor budget caps in the database schema.
- [ ] Build the mentor message review queue UI and flagged-output triage flow.
- [x] Persist `mentor_messages` rows with full token telemetry from the web
      `/api/mentor/messages` route to Postgres. _(landed in
      `apps/web/lib/mentor-runtime.ts`.)_
