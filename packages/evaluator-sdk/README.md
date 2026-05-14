# packages/evaluator-sdk

Grading service. Owns rubric application, deterministic + metric checks, and
constrained LLM grading with redaction.

## Primary Backlog Item

- `backlog/04-validation-evaluator.md` — grade schema, rubric thresholds, LLM
  guardrails, redaction, idempotency, human override.

## Related Backlog Items

- `backlog/05-mentor-safety.md` — redaction extends to mentor messages quoting
  evaluator output.
- `backlog/06-data-access-analytics.md` — `grades` and `grade_overridden` events.
- `backlog/03-cli-runner.md` — consumes runner artifacts after `execution_status=ok`.

## Depends on

- `packages/erp-schema` — rubric and stage schemas.
- `packages/db` — `grades` writes.
- `packages/ai` — constrained LLM grading goes through the same gateway.

## Non-goals

- Executing learner code. The evaluator only parses runner artifacts.
- Generating refusal copy. Authored copy lives in `packages/ui/copy`.
