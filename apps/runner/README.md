# apps/runner

Sandbox runner that executes learner submissions in `test`, `replay`, and
`mini_experiment` modes. Treats every submission as hostile.

Docker base images live under `apps/runner/docker/`.

## Primary Backlog Item

- `backlog/03-cli-runner.md` — runner modes, execution status, fixture hash
  verification, security posture, SLOs.

## Related Backlog Items

- `backlog/08-infra-foundations.md` — base images, secrets, observability,
  queue, object storage.
- `backlog/04-validation-evaluator.md` — runner artifacts hand off to evaluator.

## Depends on

- `packages/erp-schema` — `runner.yaml` schema, fixture hash spec.
- `packages/content-sdk` — package resolution and starter workspace fetch.
- `packages/db` — submission and run row updates.

## Non-goals

- Direct grading: runner produces raw artifacts only; the evaluator decides
  pass/fail.
- Mentor execution: the mentor never executes learner code.
