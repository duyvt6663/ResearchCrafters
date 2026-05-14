# Integration and Quality Gaps Backlog

Goal: turn the scaffolded app into a verified end-to-end learner loop before
adding more product surface.

Earlier integrated-build snapshot (2026-05-08, post iterations 1-10 of the
autonomous loop; superseded by "Latest Verification" below where they
conflict): static quality was green in the cached suite (`pnpm lint`,
`pnpm typecheck`, `pnpm test`, and the web production build all passed; lint
still reported one cached UI warning). `pnpm test` is **378 passing + 9 skipped
across 18 tasks**.
Local Postgres + MinIO are healthy, and CLI device-token, `start`, and
`submit` can round-trip against the local app. The two unresolved-promise
API contract bugs are fixed (`/api/packages` and
`/api/enrollments/:id/graph` now `await`); 10 routes now accept Bearer
auth via `getSessionFromRequest`; `/api/stage-attempts`,
`/api/share-cards`, and `/api/node-traversals` return structured 400 on
bad bodies; Tailwind v4 utility generation in `apps/web` is fixed and
`packages/ui` classes are emitted. **60+ route handler tests across 9
files** pin the highest-risk routes including the runner-callback
`X-Runner-Secret` constant-time gate, mentor denial → authored-refusal
attachment, and the four-state device-code polling protocol. **CLI
submit bundle policy** (deny-list / size caps / determinism) is now
covered by 10 tests. **Schema completeness** landed
(`package.safety.redaction_targets`, `mentor_leak_tests[*].must_not_contain`,
union-not-OR battery composition, 6 surfaced dropped stage fields).
**OpenTelemetry SDK** is wired in `apps/web` via `@vercel/otel` +
`withSpan` helpers (worker / runner extension in flight). **Mobile
decision-graph fallback** (`DecisionGraphMobile`) shipped and wired to
the package overview. **Failed-branch label redaction** at the catalog
spoiler boundary fixed. The app is still not end-to-end complete:
submission runs never reach a real runner/evaluator, Redis cannot start
on the default local port, the Next.js 15.5.16 dev cache flake (`Cannot
find module './3879.js'`) still destabilises Playwright under parallel
load, and persistent rows for node traversals / share cards / stage
attempts are still synthesized.

Depends on: 01, 02, 03, 04, 06, 08, 09. Blocks: calling the app end-to-end.

## Latest Verification — 2026-05-08

Commands were run against the current dirty workspace with Docker Postgres,
Redis, and MinIO healthy. Port `3000` and `3001` were already occupied by other
local Next apps, so the web app was tested on `http://localhost:3003`.

- [x] `pnpm --filter @researchcrafters/db db:migrate` is in sync.
- [x] `pnpm --filter @researchcrafters/db db:seed` succeeds and loads ResNet
      with 9 stages, 3 branches, and seeded enrollment
      `cmovf11u5001dakq882p0iob3`.
- [x] `pnpm test` passes: 18 tasks, web 139 passed + 9 skipped, 378 total
      passing tests across the workspace.
- [x] `researchcrafters validate` passes for
      `content/packages/resnet` when invoked with an absolute package path.
- [x] CLI device-token auth, `start resnet`, `submit`, and `status` round-trip
      against the local API. `submit` persists `lastRunId`, and `status` shows
      the returned run id.
- [ ] `pnpm install --frozen-lockfile` fails because `pnpm-lock.yaml` is out of
      sync with `packages/db/package.json` (`vitest` was added to the package
      manifest but not the lockfile). This blocks fresh-clone and CI installs.
- [ ] `pnpm turbo run typecheck --force` fails in `@researchcrafters/db`:
      `src/crypto.ts` has `{}` length typing errors,
      `src/encrypted-fields.ts` has Prisma extension typing errors, and
      `src/seed.ts` sees extended Prisma models as `unknown`.
- [ ] `pnpm --filter @researchcrafters/worker typecheck` and
      `pnpm --filter @researchcrafters/worker dev` fail in the current install:
      worker tracing imports `@opentelemetry/api`, but the dependency is not
      linked until the lockfile/install state is repaired. The live worker
      crashes before processing `submission_run`, leaving CLI-submitted runs
      queued.
- [ ] `pnpm --filter @researchcrafters/web build` fails: Next tries to bundle
      `node:crypto` through `../../packages/db/dist/crypto.js` →
      `../../packages/db/dist/index.js` → `apps/web/auth.ts` and errors with
      `UnhandledSchemeError`. Split server-only DB encryption exports or stop
      re-exporting them from the web-imported DB entrypoint.
- [ ] `pnpm test:e2e` against the running app is down to 3 failures:
      15 passed, 5 skipped, 3 failed. The remaining failures are
      `/api/auth/providers` returning `{}` when GitHub OAuth env vars are
      blank, `/api/entitlements` returning 401 for anonymous callers while the
      test still expects 200, and a stale StagePlayer selector
      (`h1.rc-stage-header`) even though the page renders a visible `h1`.
- [ ] The README-style CLI validation command
      `pnpm --filter @researchcrafters/cli exec researchcrafters validate ./content/packages/resnet`
      resolves the package path relative to `packages/cli` and fails. Use an
      absolute path or a root-executed CLI command in docs and smoke scripts.

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
- [x] Send runner callbacks with service authentication, not user cookies.
      _(Iteration: `/api/runs/[id]/callback` now requires
      `X-Runner-Secret`, validated with constant-time compare; anonymous
      callers get 401 with `WWW-Authenticate: X-Runner-Secret realm="runner"`
      and zero DB writes. Pinned by `route-runs-callback.test.ts`
      (7 cases). Run persistence (status / logs / metrics) once auth
      passes is still in flight.)_
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
- [ ] `pnpm typecheck` remains green.
      _(not true under `pnpm turbo run typecheck --force`; `@researchcrafters/db`
      currently fails on the new encryption / Prisma-extension typings.)_
- [x] `pnpm test` remains green.
- [ ] `@researchcrafters/web` production build remains green with local dev env.
      _(currently fails because the web build bundles `node:crypto` through
      `@researchcrafters/db`'s top-level export path.)_
- [x] Package validation passes locally for ResNet and the ERP template.
- [ ] Playwright happy path passes before merge.
      _(latest run: 15 passed, 5 skipped, 3 failed against
      `http://localhost:3003`; failures are auth-provider fixture/env mismatch,
      anonymous entitlement contract drift, and stale StagePlayer selectors.)_

## Current Verified Failures

- [ ] Fresh install is broken: `pnpm install --frozen-lockfile` fails because
      `packages/db/package.json` and `pnpm-lock.yaml` disagree on `vitest`.
- [ ] Forced typecheck/build is not green for `@researchcrafters/db`. Fix the
      encryption helper typings and extended-Prisma client typing so Turbo cache
      cannot mask a real compile failure.
- [ ] Web production build fails on `node:crypto` pulled from
      `packages/db/dist/crypto.js` through `packages/db/dist/index.js` into
      `apps/web/auth.ts`. DB encryption helpers need a server-only export path
      or the public DB index must avoid exporting Node-only modules.
- [ ] Worker tracing integration is not runnable in the current install.
      `apps/worker/src/jobs/submission-run.ts` imports `@opentelemetry/api`;
      until dependency/lockfile state is repaired, `pnpm --filter
      @researchcrafters/worker dev` crashes and no submitted run can progress
      past `queued`.
- [ ] Expanded Playwright suite now fails 3/23, not 15/23. Update or fix the
      remaining contracts:
      `/api/auth/providers` is empty with blank GitHub env,
      `/api/entitlements` is now 401 for anon, and StagePlayer smoke should use
      stable `data-testid` / role selectors instead of removed CSS classes.
- [ ] The docs/smoke command for package validation uses `pnpm --filter ... exec`
      with a relative path, causing `./content/packages/resnet` to resolve under
      `packages/cli`. Replace with an absolute path or root-executed CLI call.
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
      _(Superseded by the latest 2026-05-08 run above: after clearing `.next`
      and reusing the running server on port 3003, only 3/23 fail.)_
- [x] CLI `submit` uploads and finalizes, but does not surface or persist the
      returned run id; `researchcrafters status` still prints "No runs yet."
      _(Iteration: `submit` writes `lastRunId` to
      `.researchcrafters/config.json`; `status` reads it and renders run
      details via `getRunStatus`. Pinned by
      `packages/cli/test/status-render.test.ts`.)_
- [ ] Submission finalize creates a queued `Run` row but does not enqueue the
      BullMQ `submission_run` job, so the run remains queued with empty logs.
      _(runner-loop agent in flight)_
- [ ] Runner callback does not persist status, logs, metrics, or timestamps.
      _(`X-Runner-Secret` service-token gate **landed** with constant-time
      compare; the persistence half is still in flight via the runner-loop
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
- [x] No API route handler tests anywhere — every `apps/web/app/api/**/route.ts`
      lacks Request → Response tests. test-coverage QA listed top-10
      candidates (denial-status mapping, anonymized-email, stage-attempt
      4xx, mentor messages 4xx, submission-init bad sha256 propagation).
      _(Iterations 3/6/8: 9 route-handler test files / 60+ tests landed —
      `route-packages`, `route-stage-attempts`, `route-share-cards`,
      `route-node-traversals`, `route-runs-callback`,
      `route-mentor-messages`, `route-auth-device-code`,
      `route-auth-device-token`, `route-runs-id`. Lower-risk read-only
      routes still uncovered; see PROGRESS.md "Open today".)_
- [x] CLI `submit` bundle deny-list (`.env`, `node_modules`, `.git`, `*.pem`),
      50 MiB total cap, 5 MiB per-file cap, and 5000-file cap are
      uncovered by tests; a regression could leak `.env` to the server.
      _(Iteration 3: 10 cases in
      `packages/cli/test/submit-bundle.test.ts` pin the full deny-list
      (`.env` / `node_modules` / `.git` / `.next` / `.turbo` / `dist` /
      `*.pem` / `*.key`), the 50 MiB / 5 MiB / 5000-file caps with the
      at-cap edge case, and sorted-output sha256 determinism.)_
- [ ] `AnthropicGateway` real-provider path is mock-only — wire shape and
      error handling never exercised against a real key.
