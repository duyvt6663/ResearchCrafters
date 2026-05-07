# Integration and Quality Gaps TODO

Goal: turn the scaffolded app into a verified end-to-end learner loop before
adding more product surface.

Status (2026-05-08): re-reviewed after integration fixes. Browser routes,
package validation, seeded Postgres migration, CLI auth endpoints, the
Next 15 config fixes, NextAuth wiring, Prisma-backed data layer, browser
smoke automation, schema reconciliation, local Docker tier, CI workflow,
and per-workspace ESLint flat configs are closed. A storage-adapter
change introduced missing AWS SDK / worker-admin module exports, and an
async-permissions rewrite is mid-flight, so typecheck/build are currently
red. The remaining stabilization gate is closing those regressions plus
runner/evaluator E2E.

Depends on: 01, 02, 03, 04, 06, 08, 09. Blocks: calling the app end-to-end.

## P0: Browser Route Health

- [x] Fix Server Component / Client Component boundaries for interactive UI
      imported into Next server pages.
- [x] Add `"use client"` or thin client wrappers for `DecisionChoiceList`,
      `MentorPanel`, `AnswerEditor`, `Tabs`, and any other component using
      handlers, refs, browser APIs, or React state.
- [x] Keep server pages responsible for loading data and access policy; pass
      serializable props into client islands.
- [x] Add route smoke tests for:
      catalog -> package overview -> enroll -> first stage. _(Playwright at
      `tests/e2e/catalog-to-stage.spec.ts`)_
- [x] Add a regression test for `/packages/flash-attention` or the chosen
      flagship package overview. _(Playwright at `tests/e2e/regressions.spec.ts`)_
- [x] Add a regression test for `/enrollments/enr-1/stages/S2-tile` or the
      seeded first decision stage. _(Playwright at `tests/e2e/regressions.spec.ts`)_
- [x] Fix package overview CTA routing: implement `/packages/{slug}/start`,
      or change the CTA to call the enrollment API and redirect to the active
      stage.
- [x] Add a favicon so local and preview builds do not emit a known 404.
- [x] Adjust CSP by environment: allow Next dev React refresh in `dev`, keep
      strict nonce-based CSP for production.

Acceptance criteria:

- [x] Package overview route returns 200 in browser smoke tests.
- [x] Stage-player route returns 200 in browser smoke tests.
- [x] No React Server Component client-boundary errors appear in server logs.
- [x] No console error appears on the happy-path catalog -> stage journey except
      explicitly allowed dev-only warnings.

## P0: Package Source of Truth

- [x] Choose the active local flagship package for the app: ResNet or a real
      FlashAttention ERP.
- [x] Remove or clearly quarantine hardcoded FlashAttention / Transformer
      catalog data from `apps/web/lib/data/*`.
- [x] Load package summaries and package details from `content-sdk` output or
      Prisma-backed package build artifacts.
- [x] Seed the active package version into the database, including mirrored
      stages, stage policies, decision nodes, branches, and free-stage metadata.
- [x] Make enrollment state derive from database rows, not static `enr-1`.
- [ ] Keep fixture/stub users only in seed data or explicit test fixtures.
      _(remaining: `permissions.canAccess` still has `u-paid` stub logic)_

Acceptance criteria:

- [x] The package visible in the catalog corresponds to a real package under
      `content/packages/`.
- [x] The stage player renders stages from the same package version that the
      enrollment is pinned to.
- [ ] Deleting `apps/web/lib/data/*` does not remove the product loop.
      _(helpers are now Prisma-backed query modules, but still part of the loop)_

## P0: ERP Schema and Content Contract

- [x] Decide the canonical stage YAML shape: keep policy-owned fields under
      `stage_policy`, or loosen schemas to match the authored top-level layout.
- [x] Update `content/packages/resnet` and `content/templates/erp-basic` to the
      chosen schema.
- [x] Normalize difficulty values across docs, content, UI, and schema.
- [x] Normalize runner command shape: string command vs array command.
- [x] Normalize resource fields: `wall_clock_seconds` vs `timeout_seconds`.
- [x] Decide whether `mode: none` runner stages require a command; encode that
      explicitly in schema tests.
- [x] Fix rubric, hint, runner, and package schema drift until validation passes.
- [x] Add a fixture that intentionally fails validation so CI proves the validator
      catches schema drift.

Acceptance criteria:

- [x] `researchcrafters validate content/packages/resnet --json` passes.
- [x] `researchcrafters validate content/templates/erp-basic --json` passes.
- [ ] CI runs validation for every package under `content/packages/`. _(in
      flight — base CI workflow exists; per-package validate sweep step
      pending)_

## P1: CLI and API Contract Parity

- [x] Implement `/api/cli/version`.
- [x] Implement OAuth device-code endpoints for the CLI:
      `/api/auth/device-code`, `/api/auth/device-token`, `/api/auth/revoke`.
- [x] Teach web auth to accept Bearer tokens for CLI requests.
- [x] Align `researchcrafters start <package>` with the enroll/start API
      response shape.
- [x] Align `researchcrafters submit` with the submission-init request shape.
- [x] Implement `/api/submissions/{id}/finalize`.
- [ ] Implement `/api/runs/{id}` against real run rows.
      _(route exists, but still synthesizes queued status when rows are missing)_
- [ ] Implement `/api/runs/{id}/logs`.
      _(route exists, but waits on runner-persisted log rows/artifacts)_
- [x] Add contract tests shared by `packages/cli` and `apps/web` so payload
      drift breaks CI.

Acceptance criteria:

- [ ] `RESEARCHCRAFTERS_API_URL=http://localhost:<port> researchcrafters login`
      completes against the local web app.
      _(device-code API works; browser approval UI is still not wired)_
- [ ] `researchcrafters start <active-package>` downloads or resolves a starter
      workspace from local object storage.
- [ ] `researchcrafters submit` creates a submission, finalizes upload, enqueues
      a run, and returns a run id.
- [ ] `researchcrafters status` and `researchcrafters logs <run-id>` read from
      the same run state shown in web.

## P1: Runner, Evaluator, and Storage Integration

- [x] Add local S3-compatible storage for dev, or a filesystem-backed signed-URL
      adapter behind the same interface. _(MinIO via `docker-compose.yml`;
      LocalFsSandbox at `apps/runner/src/sandboxes/local-fs.ts`)_
- [ ] Add the required storage adapter dependencies or keep the MVP storage path
      on dependencies already present in the repo.
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

- [x] Commit a baseline Prisma migration.
- [x] Add `docker-compose.yml` or equivalent for local Postgres, Redis, and
      object storage.
- [ ] Make local service ports configurable so `docker compose up` survives
      common Redis/Postgres port collisions.
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

- [x] Replace `next lint` with a Next 15-compatible ESLint command.
- [x] Move `typedRoutes` out of `experimental` in `next.config.mjs`.
- [ ] Add a single local quality command that runs lint, typecheck, tests,
      package validation, and Playwright smoke tests.
- [x] Add CI jobs for lint, typecheck, tests, package validation, and web smoke
      tests. _(typecheck + tests + validation jobs at
      `.github/workflows/ci.yml`; per-package validate sweep + smoke wiring
      pending)_
- [ ] Capture server logs and browser console errors in Playwright artifacts.
- [x] Add an end-to-end fixture user with deterministic entitlement state.
- [ ] Add a release checklist item: "happy-path local E2E completed from fresh
      clone."

Acceptance criteria:

- [ ] `pnpm lint` passes non-interactively.
- [ ] `pnpm typecheck` remains green. _(in flight — async-permissions
      migration introduced ~30 web errors; non-web packages green)_
- [ ] `pnpm test` remains green.
- [ ] `pnpm build` remains green without local-only env assumptions.
- [ ] Package validation passes in CI.
- [ ] Playwright happy path passes before merge.

## Current Verified Failures

- [ ] `/api/packages` returns `{ "packages": {} }`; route handler returns the
      unresolved `listPackages()` promise.
- [ ] Seeded pro fixture user cannot submit a paid stage through the CLI/API
      path because `permissions.canAccess` still grants full access only to the
      synthetic `u-paid` user.
- [ ] `pnpm typecheck` and `@researchcrafters/web` build fail because
      `apps/web/lib/storage.ts` imports `@aws-sdk/client-s3` and
      `@aws-sdk/s3-request-presigner`, but those packages are not installed,
      and admin routes import `@researchcrafters/worker/admin` which is not
      yet exposed by the worker package's exports.
- [ ] `pnpm typecheck` red on `apps/web` because the in-flight
      `permissions.canAccess` async/Prisma rewrite has not yet updated all
      ~20 call sites (`Property 'allowed' does not exist on type
      'Promise<PermissionResult>'`).
- [ ] `pnpm test` fails in `apps/web` permissions tests (`vi.mock` hoisting
      error from the rewritten test file) and `packages/content-sdk`
      leak-test export tests.
- [x] `pnpm build` no longer fails on Prisma-backed catalog prerendering —
      every Prisma-touching page now exports `dynamic = "force-dynamic"`.
      The remaining build failure is missing modules above.
- [ ] `docker compose up` can fail on Redis when host port `6379` is already in
      use; make local ports configurable.
