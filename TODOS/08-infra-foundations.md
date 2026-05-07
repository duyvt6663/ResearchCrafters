# Infra Foundations TODO

Goal: stand up the shared scaffolding every other workstream depends on.

Depends on: nothing. Blocks: 01, 03, 04, 05, 06.

## Monorepo

- [ ] Initialize pnpm workspace.
- [ ] Add Turborepo with pipeline for `build`, `lint`, `typecheck`, `test`.
- [ ] Add shared `tsconfig` and `eslint` packages under `packages/config/`.
- [ ] Add `apps/web`, `packages/db`, `packages/erp-schema`, `packages/content-sdk`,
      `packages/cli`, `packages/evaluator-sdk`, `packages/ai`, `packages/ui`, `apps/runner`.
- [ ] Add `content/packages/` and `content/templates/` directories with placeholder
      package.
- [ ] Add `infra/docker/`, `infra/terraform/`, `infra/scripts/` directories.
- [ ] Document local-dev bootstrap in `README.md` at repo root.

## Environments

- [ ] Define environments: `dev`, `preview`, `staging`, `prod`.
- [ ] Map each environment to a Postgres database, Redis instance, S3 bucket prefix,
      runner pool, and LLM key.
- [ ] Use `preview` for authoring previews of in-progress package versions.
- [ ] Document promotion path between environments.

## Database

- [ ] Provision Postgres for `dev` and `staging`.
- [ ] Add Prisma project under `packages/db/prisma/`.
- [ ] Add baseline migration with empty schema.
- [ ] Set up shadow database for safe migration generation.
- [ ] Add Prisma client wrapper with logging and query timeouts.
- [ ] Add seed script for one fixture user, one package, and one enrollment.

## Queue and Workers

- [ ] Provision Redis/Valkey.
- [ ] Add BullMQ job queues: `submission_run`, `mentor_request`, `evaluator_grade`,
      `package_build`, `share_card_render`, `branch_stats_rollup`.
- [ ] Add `apps/worker` skeleton with one job handler per queue.
- [ ] Add dead-letter queue handling and retry policy per queue.
- [ ] Add idempotency keys to all enqueued jobs.

## Object Storage

- [ ] Provision S3-compatible bucket per environment.
- [ ] Define prefixes: `submissions/`, `runs/`, `packages/`, `share-cards/`,
      `evidence/`.
- [ ] Add signed-URL helpers for upload (CLI submissions) and download (starter
      workspaces, run logs).
- [ ] Set lifecycle policy on `submissions/` matching retention TODO in 06.
- [ ] Block public access by default; serve through API.

## Runner Base Images

- [ ] Build minimal Python base image for `test` and `replay` modes.
- [ ] Build Python base image with common ML libs for `mini_experiment`.
- [ ] Pin all images by digest, not tag.
- [ ] Run image scans in CI; reject high-severity CVEs.
- [ ] Strip secrets and shell history from images.
- [ ] Document image refresh policy.

## Secrets and Config

- [ ] Choose a secrets manager (e.g., AWS Secrets Manager, Doppler, Vault).
- [ ] Define secret categories: DB, Redis, S3, OAuth, Stripe, LLM providers.
- [ ] Provide typed config loader in `packages/config-runtime/`.
- [ ] Forbid secrets in `.env` files committed to git.
- [ ] Rotate keys at least quarterly; document the runbook.

## Observability

- [ ] Add OpenTelemetry SDK to web, API, worker, and runner.
- [ ] Emit structured JSON logs with request id and user id.
- [ ] Wire traces to a backend (Tempo, Honeycomb, or Datadog).
- [ ] Wire metrics to Prometheus or vendor equivalent.
- [ ] Define dashboards: submission latency, runner queue depth, mentor latency,
      grade success rate, validate-CLI duration.
- [ ] Define alerts: SLO breach, queue backlog, runner OOM rate, LLM error rate,
      payment failure rate.

## CI/CD

- [ ] Add CI pipeline that runs lint, typecheck, test, and `researchcrafters validate`
      on every package under `content/packages/`.
- [ ] Add CI matrix for Node versions matching production.
- [ ] Add separate CI job for runner Docker image builds.
- [ ] Add deploy workflow per environment with manual approval for `prod`.
- [ ] Add database migration step in deploy with rollback path.

## Auth and Identity

- [ ] Choose auth library (NextAuth, Clerk, or in-house) and document the choice.
- [ ] Implement GitHub OAuth with minimum scope `read:user`.
- [ ] Implement email/password fallback or magic-link login.
- [ ] Implement OAuth device-code flow endpoints for the CLI.
- [ ] Add session and CSRF protection.

## Privacy and Compliance Foundations

- [ ] Inventory PII fields across the data model.
- [ ] Add encryption-at-rest for sensitive columns (auth tokens, mentor transcripts).
- [ ] Add user data export endpoint behind authentication.
- [ ] Add user account deletion endpoint that cascades through submissions and
      mentor data per 06 retention rules.
- [ ] Add privacy policy and terms-of-service drafts before alpha.

## SLO Targets

- [ ] Codify SLO targets from each workstream in a single observability dashboard.
- [ ] Submission to grade: p95 < 30s `test`, < 60s `replay`, < 120s
      `mini_experiment`.
- [ ] Mentor first token: p95 < 5s hint, < 15s writing feedback.
- [ ] Validate CLI on flagship package: p95 < 60s.
- [ ] Web TTFB on package and stage pages: p95 < 500ms.

## Acceptance Criteria

- [ ] A new engineer can clone the repo and run web, worker, and runner locally
      with one bootstrap command.
- [ ] Migrations, seeds, and queues work in `dev` without manual setup.
- [ ] CI runs lint, typecheck, test, and package validation on every PR.
- [ ] Secrets never appear in git, logs, or CI artifacts.
- [ ] Observability dashboards show real traffic in `staging` before alpha.
