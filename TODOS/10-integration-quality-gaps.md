# Integration and Quality Gaps TODO

Goal: turn the scaffolded app into a verified end-to-end learner loop before
adding more product surface.

Status (verified 2026-05-08, post Tier-1 API hygiene + Tailwind v4
migration): static quality is green (`pnpm lint`, `pnpm typecheck`,
`pnpm test`, and the web production build all pass; lint still reports one
cached UI warning). Local Postgres + MinIO are healthy, and CLI
device-token, `start`, and `submit` can round-trip against the local app.
The two unresolved-promise API contract bugs are fixed (`/api/packages` and
`/api/enrollments/:id/graph` now `await`); 10 routes now accept Bearer auth
via `getSessionFromRequest`; `/api/stage-attempts`, `/api/share-cards`, and
`/api/node-traversals` return structured 400 on bad bodies; Tailwind v4
utility generation in `apps/web` is fixed and `packages/ui` classes are
emitted. The app is still not end-to-end complete: submission runs never
reach a real runner/evaluator, Redis cannot start on the default local
port, the Next.js 15.5.16 dev cache flake (`Cannot find module './3879.js'`)
still destabilises Playwright under parallel load, and persistent rows for
node traversals / share cards / stage attempts are still synthesized.

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
- [ ] No console error appears on the happy-path catalog -> stage journey except
      explicitly allowed dev-only warnings.
      _(routes are healthy and Tailwind v4 utility generation is fixed;
      sibling UI-polish agent is in flight on layout regressions, and
      visual / overflow assertions are still pending in Playwright.)_

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
- [x] Keep fixture/stub users only in seed data or explicit test fixtures.

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
- [x] CI runs validation for every package under `content/packages/`.
      _(verified in `.github/workflows/ci.yml`.)_

## P1: CLI and API Contract Parity

- [x] Implement `/api/cli/version`.
- [x] Implement OAuth device-code endpoints for the CLI:
      `/api/auth/device-code`, `/api/auth/device-token`, `/api/auth/revoke`.
- [x] Teach web auth to accept Bearer tokens for CLI requests.
- [x] Align `researchcrafters start <package>` with the enroll/start API
      response shape.
- [x] Align `researchcrafters submit` with the submission-init request shape.
- [x] Implement `/api/submissions/{id}/finalize`.
- [x] Implement `/api/runs/{id}` against real run rows.
      _(route reads real rows; it still synthesizes queued status when rows are
      missing.)_
- [ ] Implement `/api/runs/{id}/logs`.
      _(route exists, but waits on runner-persisted log rows/artifacts)_
- [x] Add contract tests shared by `packages/cli` and `apps/web` so payload
      drift breaks CI.

Acceptance criteria:

- [x] `RESEARCHCRAFTERS_API_URL=http://localhost:<port> researchcrafters login`
      completes against the local web app.
      _(device-code/device-token APIs work; browser approval UI also exists,
      though the smoke used the dev force-approval path.)_
- [ ] `researchcrafters start <active-package>` downloads or resolves a starter
      workspace from local object storage.
      _(start works, but currently creates only `.researchcrafters/config.json`;
      no starter bundle is returned.)_
- [ ] `researchcrafters submit` creates a submission, finalizes upload, enqueues
      a run, and returns a run id.
      _(submission upload + finalize work; no queue job is enqueued and the CLI
      discards the returned `runId`.)_
- [ ] `researchcrafters status` and `researchcrafters logs <run-id>` read from
      the same run state shown in web.

## P1: Runner, Evaluator, and Storage Integration

- [x] Add local S3-compatible storage for dev, or a filesystem-backed signed-URL
      adapter behind the same interface. _(MinIO via `docker-compose.yml`;
      LocalFsSandbox at `apps/runner/src/sandboxes/local-fs.ts`)_
- [x] Add the required storage adapter dependencies or keep the MVP storage path
      on dependencies already present in the repo.
- [x] Store submission metadata before upload and verify upload size + sha256
      during finalize.
- [ ] Enqueue a runner job after finalize with an idempotency key.
      _(verified: finalize creates a queued `Run` row only. Runner-loop
      agent in flight.)_
- [ ] Implement `DockerSandbox.run()` or a dev-safe sandbox adapter that enforces
      CPU, memory, wall-clock, network, and writable-mount constraints.
- [ ] Persist runner output artifacts and scrubbed logs. _(runner-loop
      agent in flight)_
- [ ] Send runner callbacks with service authentication, not user cookies.
      _(route is now Bearer-aware via `getSessionFromRequest`, but a service
      token / `X-Runner-Secret` gate is still missing — runner-loop agent
      in flight.)_
- [ ] Invoke evaluator only when `execution_status=ok`. _(runner-loop
      agent in flight)_
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
- [x] Wire `permissions.canAccess` to live membership, entitlement, package
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
      tests. _(`.github/workflows/ci.yml` runs lint + typecheck + test +
      Playwright e2e + a per-package `researchcrafters validate` sweep over
      every directory under `content/packages/`.)_
- [ ] Capture server logs and browser console errors in Playwright artifacts.
- [x] Add an end-to-end fixture user with deterministic entitlement state.
- [ ] Add a release checklist item: "happy-path local E2E completed from fresh
      clone."

Acceptance criteria:

- [x] `pnpm lint` passes non-interactively. _(passes with one cached UI
      warning about an unused eslint-disable.)_
- [x] `pnpm typecheck` remains green.
- [x] `pnpm test` remains green.
- [x] `@researchcrafters/web` production build remains green with local dev env.
- [x] Package validation passes locally for ResNet and the ERP template.
- [ ] Playwright happy path passes before merge.
      _(the original tracked smoke passed; the current expanded workspace suite
      fails under parallel execution.)_

## Current Verified Failures

- [x] `/api/packages` returns `{ "packages": {} }`; route handler returns the
      unresolved `listPackages()` promise. _(Tier-1 fix landed: now
      `await listPackages()`.)_
- [x] `/api/enrollments/:id/graph` returns `{ "graph": {} }`; route handler
      returns the unresolved `getDecisionGraph()` promise. _(Tier-1 fix
      landed: now `await getDecisionGraph(id)`.)_
- [x] Web layout has severe horizontal overflow because Tailwind is not
      generating all utility classes used by `packages/ui` (`flex-col` on the
      app shell is missing in the emitted CSS). _(Tier-1 fix landed:
      `apps/web/app/globals.css` migrated to v4
      `@import "tailwindcss"` + `@source ../../../packages/ui/src/...`;
      dead `apps/web/tailwind.config.ts` removed. UI polish for residual
      layout regressions is in flight; visual / overflow assertions in
      Playwright are still pending.)_
- [ ] Expanded Playwright suite fails 15/23 in the current workspace. Some
      failures are product gaps; several 500s are Next 15.5.16 dev
      missing-vendor-chunk failures (`Cannot find module './3879.js'`,
      vendor-chunk MODULE_NOT_FOUND under parallel test execution), so the
      E2E harness also needs server/cache isolation. Workaround:
      `rm -rf apps/web/.next && pnpm --filter @researchcrafters/web dev`.
- [ ] CLI `submit` uploads and finalizes, but does not surface or persist the
      returned run id; `researchcrafters status` still prints "No runs yet."
      _(CLI/entitlements agent in flight)_
- [ ] Submission finalize creates a queued `Run` row but does not enqueue the
      BullMQ `submission_run` job, so the run remains queued with empty logs.
      _(runner-loop agent in flight)_
- [ ] Runner callback does not persist status, logs, metrics, or timestamps and
      still lacks service-token authentication. _(route is Bearer-aware now;
      service-token / `X-Runner-Secret` gate is in flight via runner-loop
      agent.)_
- [ ] `researchcrafters start resnet` creates an effectively empty workspace
      because the enroll/start response has no starter URL or smoke command.
      _(CLI/entitlements agent is dropping the dead `EnrollResponse`
      `starterUrl/apiUrl/smokeCommand` fields; durable starter bundle
      seeding still pending.)_
- [ ] CLI upload ignores returned `uploadHeaders`; it hard-codes only
      `content-type`, which will break if signed headers become required.
- [ ] Branch traversal and web stage-attempt routes return synthesized IDs and
      telemetry only; they do not persist rows for branch stats or resumes.
      _(routes now Bearer-aware and 400-validate empty bodies; durable rows
      remain.)_
- [ ] Share-card API/page still use stub payloads and do not persist immutable
      public share-card rows/assets. _(route now 400-validates empty body
      and is Bearer-aware; durable rows still pending.)_
- [x] `pnpm typecheck`, `pnpm test`, and the web production build are green.
- [ ] `docker compose up` can fail on Redis when host port `6379` is already in
      use; make local ports configurable. _(runner-loop agent may retarget
      the port.)_
- [ ] No API route handler tests anywhere — every `apps/web/app/api/**/route.ts`
      lacks Request → Response tests. test-coverage QA listed top-10
      candidates (denial-status mapping, anonymized-email, stage-attempt
      4xx, mentor messages 4xx, submission-init bad sha256 propagation).
- [ ] CLI `submit` bundle deny-list (`.env`, `node_modules`, `.git`, `*.pem`),
      50 MiB total cap, 5 MiB per-file cap, and 5000-file cap are
      uncovered by tests; a regression could leak `.env` to the server.
- [ ] `AnthropicGateway` real-provider path is mock-only — wire shape and
      error handling never exercised against a real key.
