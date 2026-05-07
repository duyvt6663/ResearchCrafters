# Progress Snapshot

Last updated: 2026-05-07

What landed in the first end-to-end build, and what's still open. The forward
plans live in the per-workstream files in this directory; this file is a
status mirror.

## Status today

- `pnpm install` — clean, 11 workspaces wired, 1 lockfile.
- `pnpm typecheck` — 15/15 packages green.
- `pnpm test` — 13/13 packages green, 60+ tests passing.
- `pnpm build` — green across the workspace.
- `pnpm --filter @researchcrafters/web dev` — boots the catalog against the stubbed data layer, but package and stage routes currently fail browser smoke tests.
- `pnpm lint` — fails because `apps/web` still uses the deprecated `next lint` script, which prompts interactively under Next 15.

What does not run yet end-to-end:
- Package overview and stage-player browser routes are blocked by Server Component / Client Component boundary errors.
- The web app renders hardcoded FlashAttention / Transformer data, while the authored ERP package is `content/packages/resnet`.
- `researchcrafters validate content/packages/resnet` fails against the current schemas.
- CLI learner commands do not match the current web API routes or auth model.
- `db:migrate` (no live Postgres).
- Real LLM mentor calls (`AnthropicGateway` throws without `ANTHROPIC_API_KEY`).
- Docker-isolated runner runs (`DockerSandbox` throws unless `RUNNER_DOCKER_ENABLED=true`).
- BullMQ workers against a live Redis.
- `researchcrafters validate` on the flagship package with a real fixture hash (placeholder fixture in place; regeneration recipe documented).

---

## Integration and quality review — 2026-05-07

Review result: the repo has strong scaffolding and unit-level coverage, but should be treated as an integrated prototype, not an end-to-end product loop.

Verified:

- `pnpm test`, `pnpm typecheck`, and `pnpm build` pass.
- Catalog page loads locally through the Next.js dev server.
- Stub API routes respond for package listing, package detail, enrollment, enrollment state, graph, node traversal, mentor denial, submission denial, and share-card creation.
- `pnpm lint` fails in `apps/web`.
- Package overview route `/packages/flash-attention` returns 500.
- Stage route `/enrollments/enr-1/stages/S2-tile` returns 500.
- `node packages/cli/bin/researchcrafters.js validate content/packages/resnet --json` fails with schema/content drift.

P0 gaps:

- Fix Server Component / Client Component boundaries in `@researchcrafters/ui`. `DecisionChoiceList` passes event handlers, and `MentorPanel` uses `useState`, but both are currently rendered from server pages.
- Replace hardcoded `apps/web/lib/data/*` package and enrollment state with a package-backed source of truth. Either make ResNet the visible flagship package or add real FlashAttention content.
- Align `content/packages/resnet` and `content/templates/erp-basic` with `packages/erp-schema` so validation passes.
- Fix package overview CTA routing. The page links to `/packages/{slug}/start`, but that route does not exist yet.
- Add Playwright smoke tests for catalog -> package overview -> enroll -> stage load so route regressions cannot hide behind unit tests.

P1 gaps:

- Choose and wire the persistence path: Prisma-backed packages, package versions, enrollments, stages, attempts, traversals, submissions, runs, grades, mentor threads, and share cards.
- Align CLI and web API contracts. The CLI expects device auth, `/api/cli/version`, enroll/start payloads, submission finalize, run status, and run logs; the web app currently exposes only a subset with different response shapes.
- Support Bearer auth for the CLI instead of cookie-only stub sessions.
- Implement real signed upload URLs, submission finalization, runner enqueue, runner callback service auth, and run-log retrieval.
- Implement `DockerSandbox.run()` or a local sandbox adapter suitable for dev, then integrate runner outputs with the evaluator.
- Fix tooling quality gates: replace `next lint`, move `typedRoutes` out of `experimental`, add a favicon, and loosen dev-only CSP enough for Next React refresh while keeping production CSP strict.

Forward plan: use `10-integration-quality-gaps.md` as the stabilization workstream before claiming MVP end-to-end.

---

## 01 — MVP Platform

**Built**

- `apps/web` Next.js 15 app router with catalog, package overview, session player, share flow, error pages.
- 15 API routes from `docs/TECHNICAL.md` §9 (`packages`, `enrollments/:id/{state,graph}`, `node-traversals`, `stage-attempts`, `submissions`, `runs/:id` + `callback`, `grades/:id`, `mentor/messages`, `share-cards`, `entitlements`, `health`).
- `permissions.canAccess` enforced on every API route across all 7 actions.
- Mid-stage paywall guard (paywall surfaces only at boundaries).
- Decision / writing / analysis stage components exist; current route rendering is blocked by client-boundary errors tracked in `10-integration-quality-gaps.md`.
- Empty + error states wired through authored copy.

**Stubbed**

- `lib/auth.ts` cookie-based session helper; no provider chosen.
- `lib/data/*` in-memory catalog and enrollment stubs.
- `lib/telemetry.ts` `track()` no-op.

**Gaps**

- Auth provider (NextAuth / Clerk / in-house) and DB-backed sessions.
- Replace `lib/data` stubs with Prisma queries through `@researchcrafters/db`.
- React Flow decision graph render (deferred to Phase 4).
- Real share-card public URL + image asset pipeline.
- Browser smoke test for package overview and stage player.
- Static prototype reviewed with target users after smoke tests pass.

---

## 02 — ERP Content Package

**Built**

- `content/packages/resnet/` — 57 files. `package.yaml` (alpha, intermediate, free stages S001/S002), full ARA `artifact/` layer, 8 stages with stage policy content and ≥3 mentor leak tests each, 5 rubrics, 8 progressive-hint files, 3 branches at S002 (canonical / failed / suboptimal) with `support_level=explicit` carrying real `source_refs`, workspace starter + tests, canonical solution.
- `content/templates/erp-basic/` — 31-file authoring template.
- `workspace/runner.yaml` with `replay` mode for S004 + sha256 fixture.

**Stubbed**

- `workspace/fixtures/stage-004/training_log.json` is a hand-authored placeholder. `_meta.provenance` fields are literally `"PLACEHOLDER"`.
- Starter and canonical Python files are stubs, not working models.

**Gaps**

- Run the actual ResNet experiments on real hardware; replace placeholder fixture; recompute sha256.
- Reconcile ResNet YAML with `packages/erp-schema` so `researchcrafters validate content/packages/resnet` passes.
- Reconcile `content/templates/erp-basic` with the same schema so authors start from a valid package.
- Assign expert reviewer; populate `review.last_reviewed_at`.
- Beta cohort review.
- Second package (FlashAttention or DPO).

---

## 03 — CLI and Runner

**Built**

- `packages/cli` `researchcrafters` binary. Learner: `login`, `logout`, `start`, `test`, `submit`, `status`, `logs`. Author: `validate` (real, end-to-end), `preview`, `build`. Common: `--version`, version-mismatch warning.
- Submission bundling with deny-list, 50 MB / 5000 file caps, sha256, signed-URL upload.
- Typed `ApiClient` (undici) with documented HTTP contracts.
- Standard error UX (not-logged-in / missing-entitlement / fixture-hash-mismatch / runner-offline / stage-not-unlocked).
- `apps/runner` worker scaffold with three modes (`test`, `replay`, `mini_experiment`), execution-status mapping, log scrubber, security helpers (env strip, allowlist), Dockerfile placeholders.
- Replay-mode fixture sha256 verification refuses execution before sandbox spin-up.

**Stubbed**

- `DockerSandbox.run()` throws unless `RUNNER_DOCKER_ENABLED=true`. Tests use `FakeSandbox` injected via the `Sandbox` interface.
- BullMQ worker uses dynamic import; no live broker.
- OAuth device-code flow polls a stub endpoint.
- `AnthropicGateway` throws without API key (intentional safety stop).

**Gaps**

- Real Docker isolation (cgroup limits, network deny, secret stripping wired and tested).
- CLI API contract parity with `apps/web`: device-code endpoints, version endpoint, enroll/start shape, submission finalize, run status, and logs.
- gVisor / Modal / E2B integration once Docker is solid.
- npm publish + version channel; shell completion.
- Per-stage GPU policy decision (MVP CPU-only).

---

## 04 — Validation and Evaluator

**Built**

- `packages/erp-schema` Zod schemas + js-yaml parser for `package.yaml`, `graph.yaml`, stage / branch / rubric / hint YAML, `runner.yaml`. 13 tests including refinements (`support_level=explicit` requires `source_refs`; `pass_threshold` required when any visibility uses `after_pass`).
- `packages/content-sdk` validator pipeline: layer 1 structural, layer 2 ARA cross-link (claims↔experiments↔evidence + trace tree), layer 3 sandbox stub (verifies fixture sha256, refuses on mismatch), layer 4 pedagogy (clear task + progressive hints + non-spoiler feedback).
- `packages/evaluator-sdk` grade schema, idempotency by `(submissionId, rubricVersion, evaluatorVersion)`, refusal paths, partial-credit thresholds, `applyOverride` history append.
- LLM grader: rubric-only prompt, `<<UNTRUSTED>>` wrapping, redaction on grader output before storage, model-metadata telemetry. 14 tests.

**Stubbed**

- Layer 3 does not actually run starter / canonical (deferred to runner integration).
- Evaluator grade store is in-memory; not wired to `packages/db`.

**Gaps**

- CI workflow that runs `researchcrafters validate` against every package under `content/packages/` on every PR.
- Layer-3 sandbox-execution wiring once Docker is online.
- Mentor leak-test battery from `packages/ai` plugged into per-package CI.

---

## 05 — Mentor Safety

**Built**

- `packages/ai` `LLMGateway` interface; `AnthropicGateway` (lazy SDK import; throws without `ANTHROPIC_API_KEY`); `MockLLMGateway` for tests.
- `buildMentorContext` enforces `stage_policy.mentor_visibility` strictly. `always` on `canonical_solution` / `branch_solutions` is treated as misconfiguration and refused with a logged warning.
- Visibility-state evaluator with explicit triggers: `after_attempt`, `after_pass`, `after_completion`, `never`, `always`.
- Pattern-based redactor (literal + simple globs, case-insensitive).
- Default adversarial battery (direct ask, roleplay, JSON exfil, debug framing, grading attack).
- Cost-cap decision tree (per-user → per-package → per-stage) with bring-your-own `SpendStore`.
- 22 tests covering visibility, refusal, redaction, leak-test outcomes.

**Stubbed**

- `getAuthoredRefusal` returns placeholder strings; the real per-package copy lives in `@researchcrafters/ui/copy`.
- `SpendStore` and `RateLimiter` are interfaces only; production wiring lives with the web app.

**Gaps**

- Per-package mentor budget caps surfaced in DB.
- Mentor message review queue UI + flagged-output triage flow.
- `mentor_messages` rows actually written from the web `/api/mentor/messages` route to Postgres with full token telemetry.

---

## 06 — Data, Access, Analytics

**Built**

- `packages/db` Prisma schema with all 21 tables (`User`, `Membership`, `Entitlement`, `Package`, `PackageVersion`, `PackageVersionPatch`, `Stage` mirroring `stagePolicy` JSON + `passThreshold`, `DecisionNode`, `Branch`, `Enrollment` pinned to `package_version_id`, `NodeTraversal`, `StageAttempt`, `Submission`, `Run`, `Grade` with idempotency unique key, `MentorThread`, `MentorMessage` with full model telemetry, `BranchStat`, `ShareCard`, `Review`, `Event`).
- Hot-path indexes per `TODOS/06-data-access-analytics.md`.
- `prisma` singleton with 10s query timeout + `QueryTimeoutError`.
- Idempotent `seed.ts`.
- `postinstall` runs `prisma generate` so the workspace types resolve immediately.

**Stubbed**

- No baseline migration generated yet.
- Web data layer doesn't use Prisma; `lib/data/*` returns hard-coded packages.

**Gaps**

- Baseline migration committed; `pnpm db:migrate` runnable.
- Web data layer migrated off `lib/data/*` stubs and onto Prisma-backed package/enrollment/stage state.
- `permissions.canAccess` wired to live `Membership` + `Entitlement` rows.
- Branch-stats rollup job (per-branch N≥5, per-node N≥20, 5% rounding).
- Events dual-write: PostHog primary, audit-grade rows in `Event` table.
- Migration UX flow surfaced in the web app.
- Privacy: encryption-at-rest fields, data export endpoint, deletion cascade workflow.

---

## 07 — Alpha Launch

**Built**: nothing yet (correctly — activates after MVP loop is real).

**Gaps**

- Public waitlist page + landing copy.
- 5–10 decision-challenge posts (anchor: ResNet S002 degradation decision).
- Founder pricing offer.
- Cohort intake form + recruitment.

---

## 08 — Infra Foundations

**Built**

- Monorepo (pnpm 9 + Turborepo 2 + 11 workspaces).
- Shared `eslint` flat config + 3 `tsconfig` presets (`base` / `node` / `react`).
- Root scripts: `build`, `lint`, `typecheck`, `test`, `dev`, `format`.
- `.gitignore`, `.editorconfig`, `.nvmrc`, `.prettierrc`, `.prettierignore`, `pnpm-workspace.yaml`, `turbo.json`.
- `packages/config` published as `@researchcrafters/config`.
- `packages/db` `postinstall: prisma generate` so type generation runs on `pnpm install`.

**Gaps**

- Environment definitions (`dev` / `preview` / `staging` / `prod`) + Terraform.
- Postgres + Redis + S3 provisioning.
- Secrets manager (Doppler / Vault / AWS Secrets Manager).
- Auth provider chosen and wired.
- OpenTelemetry SDK in apps; dashboards for submission latency, runner queue depth, mentor latency, validate duration.
- CI pipeline running typecheck + test + `researchcrafters validate` on every PR.
- Container image scans + digest pinning.
- Privacy foundations (PII inventory, encryption-at-rest, data export, deletion cascade).
- SLO target dashboards.

---

## 09 — Frontend Design

**Built**

- Design tokens: colors (light + dark via CSS variables), typography (sans + mono, fixed pixel sizes), spacing (24-step), radius, motion, breakpoints, `statusPalette` (11 keys).
- Tailwind v4 `@theme` block + `[data-theme="dark"]` override.
- Two copy namespaces: `cope` (composable per-domain) and `copy` (web-app shape).
- `cli-commands.ts` single source for `LEARNER_COMMANDS`, `AUTHOR_COMMANDS`, `COMMON_COMMANDS`, plus `cliCommands` accessor; consumed by web pages and the `CommandBlock` component.
- Components shipped: `Button`, `StatusBadge` (always icon + label), `CommandBlock`, `Card`+children (anti-nest enforced via `data-card`), `Tabs`, `Dialog`, `Tooltip`, `PaywallModal`, `MentorPanel`, `StagePlayer` (3-column with sticky primary action), `StageMap`, `GradePanel`, `RunStatusPanel` (ANSI SGR, scroll-tail, search, severity filter, copy-with-timestamp), `EvidencePanel`, `RubricPanel`, `AnswerEditor` (autosave, undo/redo, paste sanitization), `DecisionChoiceList`, `PackageCard`, `ArtifactRef`, `MetricTable`, `ShareCardPreview`, `AppShell`, `TopNav`, `CatalogFilters`, `EmptyState`, `PackageOverview`, `ErrorPanel`.
- 14 tests on copy non-emptiness + CLI command surface stability.

**Stubbed**

- Several components carry optional pass-through props (`stageRef`, `submitHref`, `postHref`) with `TODO: wire to API` JSDoc — they accept the prop but don't fetch yet.
- React Flow graph not implemented (deferred to Phase 4).

**Gaps**

- Static prototype reviewed with one engineer + one target user.
- Client-boundary audit for every interactive `@researchcrafters/ui` component imported by Next server pages.
- Playwright smoke tests for catalog, package overview, enrollment, and stage player.
- Wireframe set captured.
- Mobile fallbacks for decision graph and code / experiment stages beyond skeleton.
- Performance budget instrumented (Lighthouse / TTI in CI).
- Anti-Patterns Checklist sign-off process formalized.
- Branch reveal transition design.

---

## Suggested next moves

1. Stabilize the browser loop from `10-integration-quality-gaps.md`: package overview and stage player must load under Playwright.
2. Reconcile ResNet and the ERP template with `packages/erp-schema` until `researchcrafters validate` passes.
3. Pick an auth provider; wire web sessions and CLI Bearer auth through `@researchcrafters/db`.
4. Stand up a `dev` Postgres + Redis + S3 (`docker-compose.yml`) and generate the first migration.
5. Align the CLI/API contracts and implement submission finalize, run status, and run logs.
6. Add a CI workflow: `pnpm install && pnpm lint && pnpm typecheck && pnpm test` plus a `researchcrafters validate` sweep over `content/packages/`.
7. Run the ResNet mini-experiment on real hardware once; replace the placeholder fixture and recompute sha256.
