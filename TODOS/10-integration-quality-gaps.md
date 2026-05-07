# Integration and Quality Gaps TODO

Goal: turn the scaffolded app into a verified end-to-end learner loop before
adding more product surface.

Status (2026-05-07): created from browser, API, CLI, validator, and workspace
quality review. This workstream should be treated as the stabilization gate
between the static prototype and the MVP product loop.

Depends on: 01, 02, 03, 04, 06, 08, 09. Blocks: calling the app end-to-end.

## P0: Browser Route Health

- [ ] Fix Server Component / Client Component boundaries for interactive UI
      imported into Next server pages.
- [ ] Add `"use client"` or thin client wrappers for `DecisionChoiceList`,
      `MentorPanel`, `AnswerEditor`, `Tabs`, and any other component using
      handlers, refs, browser APIs, or React state.
- [ ] Keep server pages responsible for loading data and access policy; pass
      serializable props into client islands.
- [ ] Add route smoke tests for:
      catalog -> package overview -> enroll -> first stage.
- [ ] Add a regression test for `/packages/flash-attention` or the chosen
      flagship package overview.
- [ ] Add a regression test for `/enrollments/enr-1/stages/S2-tile` or the
      seeded first decision stage.
- [ ] Fix package overview CTA routing: implement `/packages/{slug}/start`,
      or change the CTA to call the enrollment API and redirect to the active
      stage.
- [ ] Add a favicon so local and preview builds do not emit a known 404.
- [ ] Adjust CSP by environment: allow Next dev React refresh in `dev`, keep
      strict nonce-based CSP for production.

Acceptance criteria:

- [ ] Package overview route returns 200 in browser smoke tests.
- [ ] Stage-player route returns 200 in browser smoke tests.
- [ ] No React Server Component client-boundary errors appear in server logs.
- [ ] No console error appears on the happy-path catalog -> stage journey except
      explicitly allowed dev-only warnings.

## P0: Package Source of Truth

- [ ] Choose the active local flagship package for the app: ResNet or a real
      FlashAttention ERP.
- [ ] Remove or clearly quarantine hardcoded FlashAttention / Transformer
      catalog data from `apps/web/lib/data/*`.
- [ ] Load package summaries and package details from `content-sdk` output or
      Prisma-backed package build artifacts.
- [ ] Seed the active package version into the database, including mirrored
      stages, stage policies, decision nodes, branches, and free-stage metadata.
- [ ] Make enrollment state derive from database rows, not static `enr-1`.
- [ ] Keep fixture/stub users only in seed data or explicit test fixtures.

Acceptance criteria:

- [ ] The package visible in the catalog corresponds to a real package under
      `content/packages/`.
- [ ] The stage player renders stages from the same package version that the
      enrollment is pinned to.
- [ ] Deleting `apps/web/lib/data/*` does not remove the product loop.

## P0: ERP Schema and Content Contract

- [ ] Decide the canonical stage YAML shape: keep policy-owned fields under
      `stage_policy`, or loosen schemas to match the authored top-level layout.
- [ ] Update `content/packages/resnet` and `content/templates/erp-basic` to the
      chosen schema.
- [ ] Normalize difficulty values across docs, content, UI, and schema.
- [ ] Normalize runner command shape: string command vs array command.
- [ ] Normalize resource fields: `wall_clock_seconds` vs `timeout_seconds`.
- [ ] Decide whether `mode: none` runner stages require a command; encode that
      explicitly in schema tests.
- [ ] Fix rubric, hint, runner, and package schema drift until validation passes.
- [ ] Add a fixture that intentionally fails validation so CI proves the validator
      catches schema drift.

Acceptance criteria:

- [ ] `researchcrafters validate content/packages/resnet --json` passes.
- [ ] `researchcrafters validate content/templates/erp-basic --json` passes.
- [ ] CI runs validation for every package under `content/packages/`.

## P1: CLI and API Contract Parity

- [ ] Implement `/api/cli/version`.
- [ ] Implement OAuth device-code endpoints for the CLI:
      `/api/auth/device-code`, `/api/auth/device-token`, `/api/auth/revoke`.
- [ ] Teach web auth to accept Bearer tokens for CLI requests.
- [ ] Align `researchcrafters start <package>` with the enroll/start API
      response shape.
- [ ] Align `researchcrafters submit` with the submission-init request shape.
- [ ] Implement `/api/submissions/{id}/finalize`.
- [ ] Implement `/api/runs/{id}` against real run rows.
- [ ] Implement `/api/runs/{id}/logs`.
- [ ] Add contract tests shared by `packages/cli` and `apps/web` so payload
      drift breaks CI.

Acceptance criteria:

- [ ] `RESEARCHCRAFTERS_API_URL=http://localhost:<port> researchcrafters login`
      completes against the local web app.
- [ ] `researchcrafters start <active-package>` downloads or resolves a starter
      workspace from local object storage.
- [ ] `researchcrafters submit` creates a submission, finalizes upload, enqueues
      a run, and returns a run id.
- [ ] `researchcrafters status` and `researchcrafters logs <run-id>` read from
      the same run state shown in web.

## P1: Runner, Evaluator, and Storage Integration

- [ ] Add local S3-compatible storage for dev, or a filesystem-backed signed-URL
      adapter behind the same interface.
- [ ] Store submission metadata before upload and verify upload size + sha256
      during finalize.
- [ ] Enqueue a runner job after finalize with an idempotency key.
- [ ] Implement `DockerSandbox.run()` or a dev-safe sandbox adapter that enforces
      CPU, memory, wall-clock, network, and writable-mount constraints.
- [ ] Persist runner output artifacts and scrubbed logs.
- [ ] Send runner callbacks with service authentication, not user cookies.
- [ ] Invoke evaluator only when `execution_status=ok`.
- [ ] Persist structured grades and expose them through web and CLI.
- [ ] Render timeout, OOM, crash, and non-zero exit as execution failures, not
      grade failures.

Acceptance criteria:

- [ ] A code or replay stage can move from submitted bundle to visible grade.
- [ ] Execution failures have a retry path and do not increment normal graded
      attempt counts beyond the configured abuse-control budget.
- [ ] Runner logs shown to the learner are scrubbed and linked to the run id.

## P1: Persistence and Access Control

- [ ] Commit a baseline Prisma migration.
- [ ] Add `docker-compose.yml` or equivalent for local Postgres, Redis, and
      object storage.
- [ ] Replace package, enrollment, stage, attempt, traversal, submission, run,
      grade, mentor, entitlement, and share-card stubs with database-backed
      reads/writes.
- [ ] Wire `permissions.canAccess` to live membership, entitlement, package
      release, and stage policy rows.
- [ ] Preserve package-version pinning when package patches or new versions ship.
- [ ] Keep all learner-visible cohort percentages behind minimum-N suppression.

Acceptance criteria:

- [ ] Refreshing the browser preserves enrollment progress.
- [ ] Stage unlocks, branch choices, attempts, and grades survive server restart.
- [ ] Free-stage access, paid access, mentor access, submission access, and share
      access all use the same policy function.

## P1: Quality Gates

- [ ] Replace `next lint` with a Next 15-compatible ESLint command.
- [ ] Move `typedRoutes` out of `experimental` in `next.config.mjs`.
- [ ] Add a single local quality command that runs lint, typecheck, tests,
      package validation, and Playwright smoke tests.
- [ ] Add CI jobs for lint, typecheck, tests, package validation, and web smoke
      tests.
- [ ] Capture server logs and browser console errors in Playwright artifacts.
- [ ] Add an end-to-end fixture user with deterministic entitlement state.
- [ ] Add a release checklist item: "happy-path local E2E completed from fresh
      clone."

Acceptance criteria:

- [ ] `pnpm lint` passes non-interactively.
- [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` remain green.
- [ ] Package validation passes in CI.
- [ ] Playwright happy path passes before merge.
