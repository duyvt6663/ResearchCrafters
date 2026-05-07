# Progress Snapshot

Last updated: 2026-05-08

What landed in the integrated build, and what's still genuinely open. Forward
plans live in the per-workstream files in this directory; this file is a
status mirror. The latest verified state is listed first.

## Status today

- `pnpm typecheck` — currently red on `apps/web`. Sibling agents are
  migrating `permissions.canAccess` to an async (`Promise<PermissionResult>`)
  Prisma-backed implementation; ~20 call sites under `app/api/**/route.ts`
  and one server page have not yet been updated to `await` the result. Two
  admin routes import `@researchcrafters/worker/admin` and
  `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner`, which are not yet
  exposed by the workspace. The other 18 packages typecheck green (after
  content-sdk got the `@researchcrafters/ai` workspace dep, telemetry/worker
  picked up the `as unknown as` casts, and web's tsconfig got the
  `declaration:false` override).
- `pnpm test` — partially red:
  - `apps/web`: 32 cases pass; `lib/__tests__/permissions.test.ts` fails to
    load because the new test was authored with `vi.mock` referencing
    top-level `vi.fn()` bindings (vitest hoisting). The previous "4 cases
    failing" became a load-time failure when the test file was rewritten
    to expect the async Prisma-backed policy.
  - `packages/content-sdk`: 11 pass / 7 fail. Failures are in
    `test/leak-tests.test.ts`; the harness exists in
    `src/validator/leak-tests.ts` but `runStageLeakTests` /
    `defaultLeakTestGatewayFactory` are not yet exported from
    `src/index.ts`, and `validatePedagogy` does not surface the expected
    `pedagogy.leak_test_*` issues end-to-end.
  - Remaining packages green.
- `pnpm build` — `apps/web` build is red on the same modules missing from
  the workspace (`@aws-sdk/*`, `@researchcrafters/worker/admin`,
  `../worker/src/redis.js`). All page-level prerender failures are now
  fixed: catalog, package detail, enrollment stage, and share page each
  carry `export const dynamic = "force-dynamic"`.
- `pnpm lint` — every workspace now ships a local `eslint.config.js`
  (apps/web, apps/runner, apps/worker, and packages/{ai, cli, content-sdk,
  db, erp-schema, evaluator-sdk, telemetry, ui}), so ESLint 9 can discover
  the shared flat config from each package cwd. Run-level pass/fail is
  blocked behind the typecheck regression above.
- Package validation — green for `content/packages/resnet` and
  `content/templates/erp-basic`.
- Local migration + seed — green against Docker Postgres
  (`docker-compose.yml` brings up Postgres 16 + Redis 7 + MinIO; bootstrap
  via `infra/scripts/bootstrap.sh`).
- Browser smoke — automated Playwright specs at
  `tests/e2e/catalog-to-stage.spec.ts` and `tests/e2e/regressions.spec.ts`.
  Manual smoke had been green for catalog → ResNet overview →
  unauthenticated `/packages/resnet/start` redirect → seeded
  writing/decision stage routes.
- API smoke — device-code endpoints work, Bearer auth path works for
  enrollment. `/api/packages` still returns the unresolved
  `listPackages()` promise (handler does not `await`).

## Closed since the prior review

- ResNet is the visible flagship package, backed by seeded Prisma rows
  rather than the old hardcoded FlashAttention / Transformer catalog.
- Package and stage pages render through the Next App Router without RSC
  client-boundary errors.
- `/packages/{slug}/start` exists and redirects unauthenticated users.
- `app/icon.svg` removes the favicon 404.
- Dev/prod CSP split is in place (`apps/web/middleware.ts`): dev allows
  React Refresh, production stays nonce-based.
- `typedRoutes` is no longer under `experimental` (`next.config.mjs`).
- `next lint` was replaced with the flat-config `eslint .` invocation in
  every workspace.
- Prisma baseline migration committed at
  `packages/db/prisma/migrations/0_init/migration.sql`. Seed loads ResNet
  through `loadPackage` + `buildPackageManifest` from
  `@researchcrafters/content-sdk`.
- CLI device-code API, Bearer session lookup, enroll/start shape,
  submission init shape, and shared API contract schemas are in place
  (`apps/web/lib/api-contract.ts`, `apps/web/lib/auth.ts`).
- NextAuth v5 + Prisma adapter wired in `apps/web/auth.ts` (GitHub
  provider; email magic-link deferred pending email-service workstream).
- `apps/web/lib/data/packages.ts` and `apps/web/lib/data/enrollment.ts`
  are Prisma-backed query modules; the in-memory stub layer is gone.
- `apps/runner/src/sandboxes/local-fs.ts` provides the dev-safe
  LocalFsSandbox; Docker isolation still pending.
- ERP schema reconciled with `packages/erp-schema` and documented at
  `content/packages/SCHEMA_NOTES.md`. ResNet validates green.
- CI workflow at `.github/workflows/ci.yml` runs install, typecheck, test,
  and validation jobs (per-package validate sweep + leak-test plumbing
  not yet wired into the pipeline).
- `packages/db/prisma/schema.prisma` carries `/// PII:` annotations on
  every PII-bearing field with documented anonymize/delete strategies.
- `.claude/hooks/block-dangerous-commands.py` blocks destructive git ops
  for parallel agents.
- 12 interactive `@researchcrafters/ui` components carry `"use client"`
  (AnswerEditor, Tabs, MentorPanel, DecisionChoiceList, CommandBlock,
  EvidencePanel, Tooltip, RunStatusPanel, PaywallModal, StagePlayer,
  ShareCardPreview, Dialog).
- Mid-stage paywall guard documented in
  `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx`.

## Stabilization pointer

The historical "Integration and quality review — 2026-05-07" P0/P1 block
has been mostly addressed by integration agents. The remaining regression
bundle that needs to clear before declaring stable end-to-end is:

- The async `permissions.canAccess` migration: update remaining call-site
  `await`s, fix the test-file `vi.mock` hoisting, and remove the
  `u-paid` / `u-stub` synthetic branches.
- Workspace deps for `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`,
  and the `@researchcrafters/worker/admin` re-export so `apps/web`
  typecheck and build complete.
- `/api/packages` `await listPackages()` fix.
- `content-sdk` `runStageLeakTests` + `defaultLeakTestGatewayFactory`
  exported from `src/index.ts`.

## Open today

- Real Anthropic LLM exercise — gateway throws without
  `ANTHROPIC_API_KEY` (intentional safety stop); defer until budget cap
  wired.
- Real Docker sandbox — `LocalFsSandbox` covers dev; Docker isolation
  with cgroup limits, network deny, secret stripping pending.
- BullMQ live against Redis — worker scaffold and scheduler exist; not
  boot-tested live.
- React Flow decision graph — Phase 4; defer.
- Mobile fallbacks for decision graph and code/experiment stages.
- Performance instrumentation (Lighthouse / TTI in CI).
- Wireframes captured (catalog, overview, stage player desktop/mobile,
  decision/writing/analysis/code/experiment/reflection, mentor panel,
  grade panel, execution failure panel, paywall modal, share-card
  preview).
- Real ResNet fixture run on hardware (`workspace/fixtures/stage-004/`
  remains a placeholder with `_meta.provenance: PLACEHOLDER`).
- Second package authoring (FlashAttention or DPO).
- Marketing/alpha launch artifacts (waitlist page, landing copy,
  decision-challenge posts, founder pricing offer, intake form).
- Async `permissions.canAccess` cleanup (call-site awaits, test
  hoisting fix, synthetic-user removal).
- Workspace deps for `@aws-sdk/*` and `@researchcrafters/worker/admin`.
- `account-cascade.ts` formalized (referenced from schema PII comments
  but not yet authored).
- `/api/packages` `await` fix.
- content-sdk `runStageLeakTests` / `defaultLeakTestGatewayFactory`
  re-exports.

---

## 01 — MVP Platform

**Built**

- `apps/web` Next.js 15 App Router with catalog, package overview, session
  player, share flow, error pages.
- 15 API routes from `docs/TECHNICAL.md` §9 (`packages`,
  `enrollments/:id/{state,graph}`, `node-traversals`, `stage-attempts`,
  `submissions`, `runs/:id` + `callback`, `grades/:id`, `mentor/messages`,
  `share-cards`, `entitlements`, `health`).
- `permissions.canAccess` enforced on every API route across all 7 actions.
- Mid-stage paywall guard (paywall surfaces only at boundaries).
- Decision / writing / analysis stage components render under client
  boundaries.
- Empty + error states wired through authored copy.
- NextAuth v5 + Prisma adapter wired in `apps/web/auth.ts` (GitHub
  provider; magic-link deferred).
- `lib/data/packages.ts` + `lib/data/enrollment.ts` Prisma-backed.
- Browser smoke automated under `tests/e2e/`.
- Mid-stage paywall guard tested in stage page (`/enrollments/[id]/stages/[stageRef]/page.tsx`).

**Stubbed**

- `lib/telemetry.ts` `track()` no-op.
- `permissions.canAccess` mid-rewrite — async/Prisma-backed signature is
  in flight; current main-branch source still carries the synthetic
  `u-paid` user branch (in-flight rewrite expected to remove it).

**Gaps**

- React Flow decision graph render (deferred to Phase 4).
- Real share-card public URL + image asset pipeline.
- Static prototype reviewed with target users.
- `/api/packages` `await listPackages()` fix.
- `lib/telemetry.ts` `track()` wired to a real analytics destination.

---

## 02 — ERP Content Package

**Built**

- `content/packages/resnet/` — 57 files. `package.yaml` (alpha,
  intermediate, free stages S001/S002), full ARA `artifact/` layer, 8
  stages with stage policy content and ≥3 mentor leak tests each, 5
  rubrics, 8 progressive-hint files, 3 branches at S002
  (canonical / failed / suboptimal) with `support_level=explicit`
  carrying real `source_refs`, workspace starter + tests, canonical
  solution.
- `content/templates/erp-basic/` — 31-file authoring template.
- `workspace/runner.yaml` with `replay` mode for S004 + sha256 fixture.
- ResNet reconciled with `packages/erp-schema` (validator passes per
  `content/packages/SCHEMA_NOTES.md`); ERP template reconciled.
- `researchcrafters validate content/packages/resnet --json` and
  `validate content/templates/erp-basic --json` both pass.

**Stubbed**

- `workspace/fixtures/stage-004/training_log.json` is a hand-authored
  placeholder. `_meta.provenance` fields are literally `"PLACEHOLDER"`.
- Starter and canonical Python files are stubs, not working models.

**Gaps**

- Run the actual ResNet experiments on real hardware; replace
  placeholder fixture; recompute sha256.
- Assign expert reviewer; populate `review.last_reviewed_at`.
- Beta cohort review.
- Second package (FlashAttention or DPO).

---

## 03 — CLI and Runner

**Built**

- `packages/cli` `researchcrafters` binary. Learner: `login`, `logout`,
  `start`, `test`, `submit`, `status`, `logs`. Author: `validate` (real,
  end-to-end), `preview`, `build`. Common: `--version`, version-mismatch
  warning.
- Submission bundling with deny-list, 50 MB / 5000 file caps, sha256,
  signed-URL upload.
- Typed `ApiClient` (undici) with documented HTTP contracts.
- Standard error UX (not-logged-in / missing-entitlement /
  fixture-hash-mismatch / runner-offline / stage-not-unlocked).
- `apps/runner` worker scaffold with three modes (`test`, `replay`,
  `mini_experiment`), execution-status mapping, log scrubber, security
  helpers (env strip, allowlist), Dockerfile placeholders.
- `LocalFsSandbox` (`apps/runner/src/sandboxes/local-fs.ts`) provides a
  dev-safe filesystem-backed sandbox.
- Replay-mode fixture sha256 verification refuses execution before
  sandbox spin-up.
- CLI device-code endpoints exposed at `/api/auth/{device-code,
  device-token, revoke}`; Bearer auth supported in `apps/web/lib/auth.ts`.
- `/api/cli/version` exposed and consumed.
- API contract parity wired through `apps/web/lib/api-contract.ts`.

**Stubbed**

- `DockerSandbox.run()` throws unless `RUNNER_DOCKER_ENABLED=true`. Tests
  use `FakeSandbox` injected via the `Sandbox` interface.
- BullMQ worker uses dynamic import; no live broker.
- `AnthropicGateway` throws without API key (intentional safety stop).
- OAuth device-code flow still uses `developer_force_approve` for local
  testing — browser approval UI not yet shipped.

**Gaps**

- Real Docker isolation (cgroup limits, network deny, secret stripping
  wired and tested) so `RUNNER_DOCKER_ENABLED=true` runs safely.
- Wire `AnthropicGateway` once `ANTHROPIC_API_KEY` is in place with
  budget caps.
- Plug BullMQ workers into a live Redis broker.
- Replace `developer_force_approve` with the `/auth/device` browser
  approval UI.
- gVisor / Modal / E2B integration once Docker is solid.
- npm publish + version channel; shell completion.
- Per-stage GPU policy decision (MVP CPU-only).

---

## 04 — Validation and Evaluator

**Built**

- `packages/erp-schema` Zod schemas + js-yaml parser for `package.yaml`,
  `graph.yaml`, stage / branch / rubric / hint YAML, `runner.yaml`. 13
  tests including refinements (`support_level=explicit` requires
  `source_refs`; `pass_threshold` required when any visibility uses
  `after_pass`).
- `packages/content-sdk` validator pipeline: layer 1 structural, layer 2
  ARA cross-link (claims↔experiments↔evidence + trace tree), layer 3
  sandbox stub (verifies fixture sha256, refuses on mismatch), layer 4
  pedagogy (clear task + progressive hints + non-spoiler feedback).
- `packages/evaluator-sdk` grade schema, idempotency by
  `(submissionId, rubricVersion, evaluatorVersion)`, refusal paths,
  partial-credit thresholds, `applyOverride` history append.
- LLM grader: rubric-only prompt, `<<UNTRUSTED>>` wrapping, redaction on
  grader output before storage, model-metadata telemetry. 14 tests.
- CI workflow at `.github/workflows/ci.yml` runs typecheck + tests
  (validate sweep wiring is in flight).
- Leak-test harness exists in `packages/content-sdk/src/validator/leak-tests.ts`
  and `packages/ai`; pedagogy validator references them.

**Stubbed**

- Layer 3 does not actually run starter / canonical (deferred to runner
  integration).
- Evaluator grade store is in-memory; not yet wired to `packages/db`.

**Gaps**

- Wire the per-package `researchcrafters validate` sweep into CI _(in
  flight)_.
- Layer-3 sandbox-execution wiring once Docker is online.
- Plug the mentor leak-test battery from `packages/ai` into per-package
  CI _(harness exists; CI wiring pending)_.
- Export `runStageLeakTests` and `defaultLeakTestGatewayFactory` from
  `packages/content-sdk/src/index.ts` so downstream consumers can call
  the harness.
- Persist evaluator grades through `packages/db`.

---

## 05 — Mentor Safety

**Built**

- `packages/ai` `LLMGateway` interface; `AnthropicGateway` (lazy SDK
  import; throws without `ANTHROPIC_API_KEY`); `MockLLMGateway` for tests.
- `buildMentorContext` enforces `stage_policy.mentor_visibility`
  strictly. `always` on `canonical_solution` / `branch_solutions` is
  treated as misconfiguration and refused with a logged warning.
- Visibility-state evaluator with explicit triggers: `after_attempt`,
  `after_pass`, `after_completion`, `never`, `always`.
- Pattern-based redactor (literal + simple globs, case-insensitive).
- Default adversarial battery (direct ask, roleplay, JSON exfil, debug
  framing, grading attack).
- Cost-cap interfaces (per-user → per-package → per-stage) with
  bring-your-own `SpendStore`.
- Model telemetry (model_tier, model_id, provider, prompt_tokens,
  completion_tokens) plumbed through `MentorMessage` Prisma rows.
- 22 tests covering visibility, refusal, redaction, leak-test outcomes.

**Stubbed**

- `getAuthoredRefusal` returns placeholder strings; the real per-package
  copy lives in `@researchcrafters/ui/copy`.
- `SpendStore` and `RateLimiter` are interfaces only; production wiring
  lives with the web app.

**Gaps**

- Author per-package refusal copy in `@researchcrafters/ui/copy`.
- Wire production `SpendStore` and `RateLimiter` from the web app.
- Per-package mentor budget caps surfaced in DB.
- Mentor message review queue UI + flagged-output triage flow.
- `mentor_messages` rows actually written from web `/api/mentor/messages`
  to Postgres with full token telemetry.

---

## 06 — Data, Access, Analytics

**Built**

- `packages/db` Prisma schema with all 21 tables (`User`, `Membership`,
  `Entitlement`, `Package`, `PackageVersion`, `PackageVersionPatch`,
  `Stage` mirroring `stagePolicy` JSON + `passThreshold`,
  `DecisionNode`, `Branch`, `Enrollment` pinned to `package_version_id`,
  `NodeTraversal`, `StageAttempt`, `Submission`, `Run`, `Grade` with
  idempotency unique key, `MentorThread`, `MentorMessage` with full
  model telemetry, `BranchStat`, `ShareCard`, `Review`, `Event`).
- Hot-path indexes per `TODOS/06-data-access-analytics.md`.
- `prisma` singleton with 10s query timeout + `QueryTimeoutError`.
- Idempotent `seed.ts` that loads ResNet via `content-sdk`.
- `postinstall` runs `prisma generate` so workspace types resolve.
- Baseline migration committed at
  `packages/db/prisma/migrations/0_init/migration.sql`; `pnpm db:migrate`
  runnable.
- Web data layer Prisma-backed (`apps/web/lib/data/packages.ts`,
  `enrollment.ts`).
- PII inventory comments (`/// PII:` JSDoc annotations) on every
  PII-bearing field in `schema.prisma` with documented anonymize/delete
  strategies.

**Stubbed**

- `permissions.canAccess` Prisma rewrite is in flight; current source
  still carries the `u-paid` synthetic branch.

**Gaps**

- Finish wiring `permissions.canAccess` to live `Membership` +
  `Entitlement` rows _(in flight)_.
- Branch-stats rollup job (per-branch N≥5, per-node N≥20, 5% rounding)
  scheduler exists in `apps/worker/src/scheduler.ts`; live execution
  pending Redis.
- Events dual-write: PostHog primary, audit-grade rows in `Event` table.
- Migration UX flow surfaced in the web app.
- Privacy: encryption-at-rest fields, data export endpoint, deletion
  cascade workflow (the schema PII comments reference an
  `apps/web/lib/account-cascade.ts` that has not yet been authored).

---

## 07 — Alpha Launch

**Built**: nothing yet (correctly — activates after MVP loop is real).

**Gaps**

- Public waitlist page + landing copy.
- 5–10 decision-challenge posts (anchor: ResNet S002 degradation
  decision).
- Founder pricing offer.
- Cohort intake form + recruitment.

---

## 08 — Infra Foundations

**Built**

- Monorepo (pnpm 9 + Turborepo 2 + 11 workspaces).
- Shared `eslint` flat config + 3 `tsconfig` presets (`base` / `node` /
  `react`).
- Per-package `eslint.config.js` across all workspaces (apps/{web,
  runner, worker}, packages/{ai, cli, content-sdk, db, erp-schema,
  evaluator-sdk, telemetry, ui}).
- Root scripts: `build`, `lint`, `typecheck`, `test`, `dev`, `format`.
- `.gitignore`, `.editorconfig`, `.nvmrc`, `.prettierrc`,
  `.prettierignore`, `pnpm-workspace.yaml`, `turbo.json`.
- `packages/config` published as `@researchcrafters/config`.
- `packages/db` `postinstall: prisma generate`.
- `docker-compose.yml` brings up Postgres 16 + Redis 7 + MinIO with a
  bucket bootstrap container.
- `infra/scripts/bootstrap.sh` boots the dev tier idempotently.
- CI workflow at `.github/workflows/ci.yml` runs install + typecheck +
  test + validation jobs.
- NextAuth v5 + Prisma adapter wired (GitHub OAuth; magic-link deferred).
- OAuth device-code endpoints landed for the CLI.
- `.claude/hooks/block-dangerous-commands.py` blocks destructive git
  ops for parallel agents.

**Gaps**

- Environment definitions (`dev` / `preview` / `staging` / `prod`) +
  Terraform.
- Postgres + Redis + S3 provisioning for non-local environments.
- Secrets manager (Doppler / Vault / AWS Secrets Manager).
- OpenTelemetry SDK in apps; dashboards for submission latency, runner
  queue depth, mentor latency, validate duration.
- CI pipeline running `researchcrafters validate` sweep on every PR
  _(in flight)_.
- Container image scans + digest pinning.
- Email magic-link provider (deferred to email-service workstream).
- Browser approval UI for `/auth/device`.
- Privacy foundations: encryption-at-rest, data export endpoint,
  deletion-cascade workflow (`account-cascade.ts`).
- SLO target dashboards.
- Configurable local service ports (Redis 6379 collisions on dev hosts).

---

## 09 — Frontend Design

**Built**

- Design tokens: colors (light + dark via CSS variables), typography
  (sans + mono, fixed pixel sizes), spacing (24-step), radius, motion,
  breakpoints, `statusPalette` (11 keys).
- Tailwind v4 `@theme` block + `[data-theme="dark"]` override.
- Two copy namespaces: `cope` (composable per-domain) and `copy`
  (web-app shape).
- `cli-commands.ts` single source for `LEARNER_COMMANDS`,
  `AUTHOR_COMMANDS`, `COMMON_COMMANDS`, plus `cliCommands` accessor;
  consumed by web pages and the `CommandBlock` component.
- Components shipped: `Button`, `StatusBadge` (always icon + label),
  `CommandBlock`, `Card`+children (anti-nest enforced via `data-card`),
  `Tabs`, `Dialog`, `Tooltip`, `PaywallModal`, `MentorPanel`,
  `StagePlayer` (3-column with sticky primary action), `StageMap`,
  `GradePanel`, `RunStatusPanel` (ANSI SGR, scroll-tail, search,
  severity filter, copy-with-timestamp), `EvidencePanel`, `RubricPanel`,
  `AnswerEditor` (autosave, undo/redo, paste sanitization),
  `DecisionChoiceList`, `PackageCard`, `ArtifactRef`, `MetricTable`,
  `ShareCardPreview`, `AppShell`, `TopNav`, `CatalogFilters`,
  `EmptyState`, `PackageOverview`, `ErrorPanel`.
- 12 interactive components carry `"use client"` (AnswerEditor, Tabs,
  MentorPanel, DecisionChoiceList, CommandBlock, EvidencePanel, Tooltip,
  RunStatusPanel, PaywallModal, StagePlayer, ShareCardPreview, Dialog).
- `force-dynamic` opt-out on every Prisma-touching page (`app/page.tsx`,
  `app/packages/[slug]/page.tsx`, `app/enrollments/[id]/stages/[stageRef]/page.tsx`,
  `app/enrollments/[id]/share/page.tsx`).
- Playwright config + e2e specs at `tests/e2e/`.
- 14 tests on copy non-emptiness + CLI command surface stability.

**Stubbed**

- Several components carry optional pass-through props (`stageRef`,
  `submitHref`, `postHref`) with `TODO: wire to API` JSDoc — they
  accept the prop but don't fetch yet.
- React Flow graph not implemented (deferred to Phase 4).

**Gaps**

- Static prototype reviewed with one engineer + one target user.
- Wireframe set captured.
- Mobile fallbacks for decision graph and code/experiment stages beyond
  skeleton.
- Performance budget instrumented (Lighthouse / TTI in CI).
- Anti-Patterns Checklist sign-off process formalized.
- Branch reveal transition design.

---

## Suggested next moves

1. Land the async `permissions.canAccess` rewrite end-to-end (await
   updates at every call site; test-file `vi.mock` hoisting fix; remove
   the synthetic `u-paid` / `u-stub` branches).
2. Wire `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` into the
   web workspace and re-export `worker/admin` so the build links.
3. Fix `/api/packages` to `await listPackages()`.
4. Export `runStageLeakTests` + `defaultLeakTestGatewayFactory` from
   `packages/content-sdk/src/index.ts`.
5. Wire the mentor leak-test battery and `researchcrafters validate`
   sweep into the existing CI workflow.
6. Complete submission → runner → evaluator → grade persistence with
   real DockerSandbox or LocalFs in dev mode.
7. Run the ResNet mini-experiment on real hardware once; replace the
   placeholder fixture and recompute sha256.
