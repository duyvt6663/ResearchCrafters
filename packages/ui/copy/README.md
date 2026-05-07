# packages/ui/copy

Authored, safety- and tone-sensitive strings. Never generate these via LLM.

Per `TODOS/09-frontend-design.md` Copy Library:

- Paywall variants by entry point.
- Mentor refusal copy authored per package per `TODOS/05-mentor-safety.md`.
- Execution-failure variants: timeout, OOM, crash, exit non-zero.
- Rare-branch suppression copy per `TODOS/06-data-access-analytics.md`.
- Stale CLI version warning referenced by `TODOS/03-cli-runner.md`.
- Runner-offline, mentor-unavailable, stage-locked copy.
- Empty catalog and 1-2 package early-state copy.
- Migration UX copy.
