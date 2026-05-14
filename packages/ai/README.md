# packages/ai

Mentor context builder, LLM gateway, prompt cache, leak tests, and cost caps.
Provider-agnostic — model selection is per-call.

## Primary Backlog Item

- `backlog/05-mentor-safety.md` — stage_policy gates, leak tests, cost caps,
  authored refusal copy, telemetry of model tier per message.

## Related Backlog Items

- `backlog/04-validation-evaluator.md` — evaluator's LLM grading uses the same
  gateway; redaction is shared.
- `backlog/06-data-access-analytics.md` — `mentor_threads`, `mentor_messages`,
  cost telemetry.

## Depends on

- `packages/erp-schema` — stage_policy types.
- `packages/content-sdk` — gated artifact retrieval per policy.
- `packages/db` — thread/message persistence.

## Non-goals

- Owning correctness. The evaluator decides pass/fail.
- Executing learner code.
