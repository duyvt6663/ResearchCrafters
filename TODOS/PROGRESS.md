# Progress Snapshot

Last updated: 2026-05-08 (post Tier-1 API hygiene + Tailwind v4 migration)

What landed in the integrated build, and what's still genuinely open. Forward
plans live in the per-workstream files in this directory; this file is a
status mirror. The latest verified state is listed first.

## Status today

- `pnpm lint` — green. It still prints one cached UI warning for an unused
  eslint-disable in `packages/ui/src/components/RunStatusPanel.tsx`.
- `pnpm typecheck` — green across all 19 tasks.
- `pnpm test` — green across all 18 tasks.
- `@researchcrafters/web` production build — green with local dev env
  (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
  `RESEARCHCRAFTERS_API_URL`).
- Package validation — green for `content/packages/resnet` and
  `content/templates/erp-basic`; ResNet leak tests run for stages S001-S007
  and skip S008 because no attacks/redaction targets are declared.
- Local migration + seed — green against Docker Postgres. The seed loads
  ResNet with 8 stages, 3 branches, and fixture enrollment
  `cmovf11u5001dakq882p0iob3`.
- Local services — Postgres and MinIO are healthy. Redis still fails to start
  because host port `6379` is already allocated, so live BullMQ/worker testing
  is blocked until ports are configurable or the host Redis conflict is
  resolved.
- Browser smoke — the original tracked 3-spec smoke passed against the local
  app. The current workspace now contains additional untracked API/stage/share
  E2E specs; with those present, `pnpm test:e2e` fails 15/23 under parallel
  dev-server execution. Failures include known API hardening gaps and Next dev
  bundler missing-vendor-chunk 500s under load. Treat the expanded E2E suite as
  a stabilization target before calling browser quality green.
- Browser layout — Tailwind v4 utility generation is fixed in `apps/web`.
  Old `globals.css` used v3 directives plus a v3 `tailwind.config.ts` that v4
  ignored. Migrated to `@import "tailwindcss"` + `@source
  "../../../packages/ui/src/**/*.{ts,tsx}"` and removed the dead
  `apps/web/tailwind.config.ts`. CSS payload went from 109 lines to ~1328
  lines with utility classes resolved. UI polish (catalog/overview/stage
  layouts, AppShell, dark-mode toggle) is _(in flight)_ behind a sibling
  agent.
- API smoke — `/api/health` works; `/api/cli/version`,
  `/api/auth/device-code`, `/api/auth/device-token`, Bearer enrollment,
  submission init/finalize, run status, and run logs all respond. The
  unresolved-promise contract bugs are now fixed: `/api/packages` now
  `await`s `listPackages()` and `/api/enrollments/:id/graph` now `await`s
  `getDecisionGraph(id)`.
- CLI smoke — validated `--version`, package validation, device-token auth,
  `researchcrafters start resnet`, and `researchcrafters submit`. The CLI can
  upload/finalize a submission. CLI/entitlements polish (persist `lastRunId`,
  fix `slug@slug@stub` rendering, drop dead `EnrollResponse` fields, replace
  `/api/entitlements` stub with live Prisma reads) is _(in flight)_ behind a
  sibling agent.
- Runner/evaluator loop — not end-to-end. Finalize creates a queued `Run` row,
  but no BullMQ `submission_run` job is enqueued, the callback does not persist
  result state/logs/metrics, and the latest verified run remained `queued` with
  empty logs. Runner-loop wiring (BullMQ `submission_run` enqueue from
  finalize, the worker, callback persistence with service-token auth) is
  _(in flight)_ behind a sibling agent.

## Closed since the prior review

- **Tier-1 API hygiene landed.** `/api/packages` now `await`s `listPackages()`
  (was the unresolved-promise `{ "packages": {} }` bug) and
  `/api/enrollments/:id/graph` now `await`s `getDecisionGraph(id)` (was the
  unresolved-promise `{ "graph": {} }` bug).
- **10 routes are Bearer-aware via `getSessionFromRequest`** (from 4 to all
  14 server routes that use auth): `grades/[id]`, `node-traversals`,
  `enrollments/[id]/graph`, `enrollments/[id]/state`, `stage-attempts`,
  `entitlements`, `packages` (root), `packages/[slug]`, `share-cards`,
  `runs/[id]/callback`. CLI Bearer traffic now reaches the policy layer on
  every route.
- **Body-validation guards on 3 routes.** `/api/stage-attempts`,
  `/api/share-cards`, and `/api/node-traversals` now return structured 400
  on empty / malformed body (`bad_request` + `invalid_json` /
  `missing_required_fields`) instead of letting Prisma 5xx with `id:
  undefined`.
- **Tailwind v4 migration in `apps/web`.** The "bland UI" was caused by
  mixed v3/v4 syntax + a CSS-var typo + a missing `@source` for the
  `packages/ui` workspace. `apps/web/app/globals.css` now uses
  `@import "tailwindcss"` and explicitly `@source`s
  `../../../packages/ui/src/**/*.{ts,tsx}`; the dead
  `apps/web/tailwind.config.ts` (a v3 file v4 was ignoring) is removed.
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
has been mostly addressed by integration agents, and the Tier-1 API hygiene
+ Tailwind v4 migration above closed the most visible regressions. The
remaining regression bundle that needs to clear before declaring stable
end-to-end is:

- Submission finalize must enqueue `submission_run` with an idempotency key;
  runner callback must authenticate as a service and persist run status, logs,
  metrics, and timestamps. _(runner-loop agent in flight)_
- `/api/runs/[id]/callback` is currently unauthenticated (Bearer-aware now,
  but no service-token check yet); runner-loop agent is gating it with
  `X-Runner-Secret`. _(in flight)_
- CLI `submit` must honor `uploadHeaders`, persist/display the returned
  `runId`, and make `status`/`logs` usable without manually querying the DB.
  _(CLI/entitlements agent in flight)_
- `/api/entitlements` still filters on the legacy `u-paid` stub user id;
  CLI/entitlements agent is replacing it with live Prisma reads. _(in flight)_
- Start/enroll needs a starter bundle URL or workspace materialization path.
- Branch traversal, web stage attempts, and share cards still need persistent
  writes instead of synthesized IDs/stub payloads.
- Trace/experiment-tree support needs typed validation for `branch_id`,
  `parents`, `edges`, and a compiled web payload.
- Schema-completeness gaps (`package.safety.redaction_targets` dropped,
  `mentor_leak_tests[*].must_not_contain` dropped, leak-test battery
  composition uses OR not union, dropped stage fields). _(schema agent in
  flight)_

## Open today

Genuinely-open items not currently being closed by the in-flight sibling
agents:

- **`/api/runs/[id]/callback` still unauthenticated end-to-end.** It now
  uses `getSessionFromRequest`, but has no service-token / runner-secret
  gate. _(runner-loop agent is wiring `X-Runner-Secret`; until that lands the
  route is open.)_
- **No API route handler tests** — every `apps/web/app/api/**/route.ts`
  lacks `Request -> Response` tests. test-coverage QA listed top-10
  candidates (denial-status mapping, anonymized-email, stage-attempt 400
  paths, mentor messages 4xx, submission-init bad sha256 propagation, etc.).
- **CLI submit bundle policy untested.** The `.env` / `node_modules` /
  `*.pem` / `.git` deny-list, the 50 MiB total cap, the 5 MiB per-file cap,
  and the 5000-file cap are enforced inside `collectFiles` but no test ever
  exercises them. A regression here could silently include `.env` files in
  submissions and leak developer secrets.
- **`AnthropicGateway` real-provider path is mock-only.** Every mentor and
  grader test runs through `MockLLMGateway`; the wire shape, error handling
  (`rate_limit_error`, `overloaded_error`), and token-counting glue have
  never been exercised against a real key. Defer until budget cap is wired.
- **Redis port conflict (`6379` already allocated)** blocks live BullMQ /
  worker testing. Make local docker-compose ports configurable; the
  runner-loop agent may retarget the port as part of its work.
- **Next.js 15.5.16 dev cache flake** (`Cannot find module './3879.js'`,
  vendor-chunk MODULE_NOT_FOUND under parallel Playwright load). Workaround
  is `rm -rf apps/web/.next && pnpm --filter @researchcrafters/web dev`.
  Document in the dev-loop runbook; either pin Next or move dev cache
  in-memory / per-Playwright-worker.
- **Real ResNet fixture** still a placeholder.
  `workspace/fixtures/stage-004/training_log.json` has
  `_meta.provenance: "PLACEHOLDER"`. Needs an actual hardware run; recompute
  sha256 in `runner.yaml` after.
- **Math node missing from ResNet curriculum graph.** PRD §5 requires 9
  node types; ResNet covers 8 (no `math` stage). The schema allows `math`
  (`packages/erp-schema/src/schemas/graph.ts`); the package just doesn't use
  it.
- **S004 redaction target `"0.03"` is too short** to be a useful leak guard
  (matches `"0.038"`, `"0.030 epoch"`). Needs longer, contextualized
  phrases.
- **Mobile fallbacks** for decision graph and code/experiment stages —
  skeleton only.
- **OpenTelemetry SDK** still not installed in web/worker/runner; no
  dashboards yet for submission latency, runner queue depth, mentor
  latency, validate duration.
- **Encryption-at-rest for PII fields** still not implemented. The
  `/// PII:` JSDoc inventory is in `schema.prisma`; column-level
  encryption is the next step.
- **Wireframe set** still not captured (catalog, overview, stage player
  desktop/mobile, decision/writing/analysis/code/experiment/reflection,
  mentor panel, grade panel, execution failure panel, paywall modal,
  share-card preview).
- **Performance budget not instrumented** (Lighthouse / TTI in CI).
- **Branch reveal transition** design — pick inline expansion vs.
  dedicated reveal vs. graph repaint and document the rationale.
- **Second package authoring** (FlashAttention or DPO).
- **Marketing/alpha launch artifacts** (waitlist page, landing copy,
  decision-challenge posts, founder pricing offer, intake form).
- **Trace/experiment-tree** validation for `branch_id`, `parents`,
  `edges`; compiled web payload plumbing.
- **Persisted `node_traversals` and `share_card` rows.** Both routes still
  return synthesized IDs.

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
- `/api/packages` returns the awaited Prisma-backed catalog (Tier-1 fix).
- `/api/enrollments/:id/graph` returns the awaited decision graph (Tier-1
  fix).
- 10 routes accept Bearer auth via `getSessionFromRequest` (Tier-1 fix);
  CLI traffic is no longer dropped to anonymous on `packages`,
  `packages/[slug]`, `entitlements`, `enrollments/[id]/{state,graph}`,
  `node-traversals`, `stage-attempts`, `share-cards`, `grades/[id]`,
  `runs/[id]/callback`.
- `/api/stage-attempts`, `/api/share-cards`, `/api/node-traversals`
  return structured 400 on empty / malformed body instead of 500
  (Tier-1 fix).
- Tailwind v4 utility generation in `apps/web` (Tier-1 fix). `globals.css`
  now uses `@import "tailwindcss"` + `@source ../../../packages/ui/src/...`;
  the dead v3 `tailwind.config.ts` is gone. CSS payload 109 → ~1328 lines.
- Browser smoke automated under `tests/e2e/`.
- Mid-stage paywall guard tested in stage page (`/enrollments/[id]/stages/[stageRef]/page.tsx`).

**Stubbed**

- `lib/telemetry.ts` logs locally; vendor/audit dual-write is not wired.
- `node-traversals`, `stage-attempts`, and `share-cards` routes still return
  synthesized IDs or stub payloads instead of durable product records.
- `/api/entitlements` still filters on legacy `u-paid` user id _(in flight,
  CLI/entitlements agent replacing with live Prisma reads)_.

**Gaps**

- React Flow decision graph render (deferred to Phase 4).
- Real share-card public URL + image asset pipeline.
- Static prototype reviewed with target users.
- UI polish (catalog/overview/stage layouts, AppShell, dark-mode toggle)
  _(in flight)_.
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
- `apps/web/lib/mentor-runtime.ts` calls `AnthropicGateway` when the
  API key is set and falls back to `MockLLMGateway` otherwise; persists
  `MentorThread` + `MentorMessage` Prisma rows on every request, with
  full token telemetry.
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

- `node_traversals`, share-card snapshots, and some stage-attempt writes are
  still API stubs even though the tables exist.

**Gaps**

- Persist branch traversal and web stage-attempt writes through Prisma.
- Branch-stats rollup job (per-branch N≥5, per-node N≥20, 5% rounding)
  scheduler exists in `apps/worker/src/scheduler.ts`; live execution
  pending Redis.
- Events dual-write: PostHog primary, audit-grade rows in `Event` table.
- Migration UX flow surfaced in the web app.
- Privacy: encryption-at-rest fields and policy/legal docs.

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
- Container image scans + digest pinning.
- Email magic-link provider (deferred to email-service workstream).
- Privacy foundations: encryption-at-rest and policy/legal docs.
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

1. Land API route handler tests (top-10 from test-coverage QA) so future
   regressions like the Tier-1 batch get caught in CI rather than QA passes.
2. Add Playwright visual/layout assertions for desktop and mobile overflow
   now that Tailwind v4 utilities resolve correctly.
3. Complete submission -> runner -> evaluator -> grade persistence with
   LocalFs in dev mode first, then DockerSandbox isolation. _(runner-loop
   agent in flight)_
4. Make Redis/Postgres/MinIO host ports configurable so the full local worker
   stack can boot even when common ports are occupied.
5. Update CLI `start`/`submit`: provide a starter bundle path, honor
   `uploadHeaders`, persist `lastRunId`, and make `status`/`logs` use it.
   _(CLI/entitlements agent in flight)_
6. Persist branch traversals, web stage attempts, and share-card snapshots so
   branch stats, resume, and sharing are real.
7. Build the ERP trace graph contract: validate `exploration_tree.yaml`
   edges/parents/branch ids, compile a trace graph payload, and render it in
   the web experiment-tree view.
8. Add `package.safety.redaction_targets` to `packageSchema` and union with
   per-stage redaction targets; capture `mentor_leak_tests[*].must_not_contain`
   and run authored attacks on top of the default battery rather than
   replacing it. _(schema-completeness agent in flight)_
9. Run the ResNet mini-experiment on real hardware once; replace the
   placeholder fixture and recompute sha256.
10. Add a `math` node stage to the ResNet graph (PRD §5 requires 9 node
    types; ResNet covers 8).
