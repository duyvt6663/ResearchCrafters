# Infra Foundations Backlog

Goal: stand up the shared scaffolding every other workstream depends on.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

Depends on: nothing. Blocks: 01, 03, 04, 05, 06.

## Monorepo

- [x] Initialize pnpm workspace.
- [x] Add Turborepo with pipeline for `build`, `lint`, `typecheck`, `test`.
- [x] Add shared `tsconfig` and `eslint` packages under `packages/config/`.
- [x] Add `apps/web`, `packages/db`, `packages/erp-schema`, `packages/content-sdk`,
      `packages/cli`, `packages/evaluator-sdk`, `packages/ai`, `packages/ui`, `apps/runner`.
- [x] Add `content/packages/` and `content/templates/` directories with placeholder
      package.
- [x] Add `infra/docker/`, `infra/terraform/`, `infra/scripts/` directories.
      _(`infra/scripts/bootstrap.sh` and `docker-compose.yml` exist; Terraform
      directory pending non-local environments)_
- [x] Document local-dev bootstrap in `README.md` at repo root.

## Environments

- [ ] Define environments: `dev`, `preview`, `staging`, `prod`.
- [ ] Map each environment to a Postgres database, Redis instance, S3 bucket prefix,
      runner pool, and LLM key.
- [ ] Use `preview` for authoring previews of in-progress package versions.
- [ ] Document promotion path between environments.

## Database

- [ ] Provision Postgres for `dev` and `staging`.
- [x] Add Prisma project under `packages/db/prisma/`.
- [x] Add baseline migration with the current schema.
- [ ] Set up shadow database for safe migration generation.
- [x] Add Prisma client wrapper with logging and query timeouts.
- [x] Add seed script for one fixture user, one package, and one enrollment.

## Queue and Workers

- [x] Provision Redis/Valkey. _(local Redis 7 via `docker-compose.yml`;
      non-local environments pending)_
- [x] Add BullMQ job queues: `submission_run`, `mentor_request`, `evaluator_grade`,
      `package_build`, `share_card_render`, `branch_stats_rollup`.
- [x] Add `apps/worker` skeleton with one job handler per queue.
- [ ] Add dead-letter queue handling and retry policy per queue.
- [ ] Add idempotency keys to all enqueued jobs.

## Object Storage

- [x] Provision S3-compatible bucket per environment. _(local MinIO via
      `docker-compose.yml`; non-local environments pending)_
- [ ] Define prefixes: `submissions/`, `runs/`, `packages/`, `share-cards/`,
      `evidence/`.
- [x] Add signed-URL helpers for upload (CLI submissions) and download (starter
      workspaces, run logs).
- [ ] Set lifecycle policy on `submissions/` matching retention backlog item in 06.
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
      _(Iteration 10 landed for `apps/web`: `@vercel/otel` wired via
      `apps/web/instrumentation.ts`; `apps/web/lib/tracing.ts` exposes
      `withSpan` + `setActiveSpanAttributes` helpers with a transparent
      test path; pinned by `apps/web/lib/__tests__/tracing.test.ts` (6
      cases). Worker / runner extension is **in flight** in this run.)_
- [ ] Emit structured JSON logs with request id and user id.
- [ ] Wire traces to a backend (Tempo, Honeycomb, or Datadog).
- [ ] Wire metrics to Prometheus or vendor equivalent.
- [ ] Define dashboards: submission latency, runner queue depth, mentor latency,
      grade success rate, validate-CLI duration.
- [ ] Define alerts: SLO breach, queue backlog, runner OOM rate, LLM error rate,
      payment failure rate.

## CI/CD

- [x] Add CI pipeline that runs lint, typecheck, test, Playwright smoke, and
      `researchcrafters validate` on every package under `content/packages/`.
      _(`.github/workflows/ci.yml`)_
- [ ] Add CI matrix for Node versions matching production.
- [ ] Add separate CI job for runner Docker image builds.
- [ ] Add deploy workflow per environment with manual approval for `prod`.
- [ ] Add database migration step in deploy with rollback path.

## Auth and Identity

- [x] Choose auth library (NextAuth, Clerk, or in-house) and document the choice.
      _(NextAuth v5 + Prisma adapter; see `apps/web/auth.ts`)_
- [x] Implement GitHub OAuth with minimum scope `read:user`.
- [ ] Implement email/password fallback or magic-link login. _(deferred to
      email-service workstream)_
- [x] Implement OAuth device-code flow endpoints for the CLI.
- [x] Implement the browser approval UI for `/auth/device`.
- [x] Add session and CSRF protection. _(NextAuth v5 + middleware-driven CSP)_

## Privacy and Compliance Foundations

- [x] Inventory PII fields across the data model. _(`/// PII:` JSDoc
      annotations on every PII field in `packages/db/prisma/schema.prisma`)_
- [x] Add encryption-at-rest for sensitive columns (auth tokens, mentor
      transcripts). _(landed: `packages/db/src/crypto.ts` (AES-256-GCM,
      `enc:v1:` envelope, authenticated, idempotent) +
      `packages/db/src/encrypted-fields.ts` (`ENCRYPTED_FIELDS` policy +
      `withEncryption()` Prisma client extension covering
      `Account.{access,refresh,id}_token`, `Session.sessionToken`,
      `MentorMessage.bodyText`, `StageAttempt.answer`). Wired into the
      singleton in `packages/db/src/client.ts`. Operator + rotation +
      backfill docs at `packages/db/ENCRYPTION.md`. Tests:
      `packages/db/test/crypto.test.ts` -> 13 pass, 1 skipped live-PG
      integration. QA: `qa/encryption-at-rest-fields-2026-05-17.md`. See
      `backlog/06-data-access-analytics.md ## Open gaps from snapshot`
      for the rollup pointer.)_
- [x] Add user data export endpoint behind authentication. _(`apps/web/app/api/account/export/route.ts` calls `exportAccount` from `lib/account-cascade.ts`)_
- [x] Add user account deletion endpoint that cascades through submissions and
      mentor data per 06 retention rules. _(`apps/web/lib/account-cascade.ts`
      and `/api/account/delete`)_
- [ ] Add privacy policy and terms-of-service drafts before alpha.

## SLO Targets

- [ ] Codify SLO targets from each workstream in a single observability dashboard.
- [ ] Submission to grade: p95 < 30s `test`, < 60s `replay`, < 120s
      `mini_experiment`.
- [ ] Mentor first token: p95 < 5s hint, < 15s writing feedback.
- [ ] Validate CLI on flagship package: p95 < 60s.
- [ ] Web TTFB on package and stage pages: p95 < 500ms.

## Acceptance Criteria

- [x] A new engineer can clone the repo and run web, worker, and runner locally
      with one bootstrap command. _(`infra/scripts/bootstrap.sh`)_
- [x] Migrations, seeds, and queues work in `dev` without manual setup.
- [x] CI runs lint, typecheck, test, and package validation on every PR.
- [ ] Secrets never appear in git, logs, or CI artifacts.
- [ ] Observability dashboards show real traffic in `staging` before alpha.

## Open gaps from snapshot

- [ ] Restore fresh-clone installability: `pnpm install --frozen-lockfile`
      currently fails because `packages/db/package.json` and `pnpm-lock.yaml`
      are out of sync.
- [ ] Keep server-only Node modules out of web bundles. The web production
      build currently imports `node:crypto` via `@researchcrafters/db`'s
      top-level export path after the DB encryption work.
- [ ] Define `dev` / `preview` / `staging` / `prod` environments and Terraform.
- [ ] Provision Postgres, Redis, and S3 across environments.
- [ ] Choose and wire a secrets manager (Doppler / Vault / AWS Secrets Manager).
- [ ] Add OpenTelemetry SDK to web, worker, and runner; expose dashboards for
      submission latency, runner queue depth, mentor latency, and validate
      duration. _(Iteration 10 landed in `apps/web`; worker / runner
      extension **in flight** this run; current worker dev crashes until the
      dependency/lockfile state is repaired; dashboards still pending.)_
- [x] Stand up CI workflow that runs typecheck, test, Playwright smoke, and
      `researchcrafters validate` on every PR. _(`.github/workflows/ci.yml`)_
- [ ] Add container image scans and digest pinning for runner base images.
- [x] Land privacy foundations: PII inventory, encryption-at-rest, data export,
      deletion cascade. _(all four landed: PII inventory via `/// PII:`
      JSDoc on every sensitive column in
      `packages/db/prisma/schema.prisma`; encryption-at-rest via the
      column-level Prisma extension in `packages/db/src/crypto.ts` +
      `packages/db/src/encrypted-fields.ts` (wired in `client.ts`; docs
      at `packages/db/ENCRYPTION.md`); data export at
      `apps/web/app/api/account/export/route.ts`; deletion cascade at
      `apps/web/lib/account-cascade.ts` +
      `apps/web/app/api/account/delete/route.ts`. QA:
      `qa/encryption-at-rest-fields-2026-05-17.md`. Known integration
      cleanups (web bundle splitting for the DB top-level export,
      extension typecheck typings) remain open in
      `backlog/10-integration-quality-gaps.md`.)_
- [ ] Codify SLO target dashboards in a single observability surface.
- [x] Pick an auth provider and wire it through the web app. _(NextAuth v5 +
      Prisma adapter)_
- [ ] Make local Docker service ports configurable; Redis on host `6379` can
      collide with an existing developer service. _(runner-loop agent may
      retarget the port as part of wiring BullMQ.)_
- [x] Finish ESLint 9 migration after adding per-workspace flat configs:
      install/configure missing plugins, clean unused disables, and resolve the
      surfaced worker/UI/web lint errors. _(per-workspace flat configs landed
      across all packages)_
