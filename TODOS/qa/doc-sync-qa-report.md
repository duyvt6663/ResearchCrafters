# Doc Sync QA Report

Date: 2026-05-08
Author: doc-sync-qa agent

## TL;DR

Sibling QA agents had already done the bulk of the reconciliation between the
last commit and the live codebase by the time this agent ran. PROGRESS.md and
all 11 workstream files reflect the live state with one exception: a few
already-shipped items (mentor message persistence, account data export
endpoint, banner date on PROGRESS + 10) were still listed as open. Those have
been corrected here. The other QA reports under `TODOS/qa/*-qa-report.md`
were left untouched.

## Live-state evidence sweep (verified at 22:42-22:48 local)

- `pnpm typecheck` — green. 19/19 turbo tasks successful.
- `pnpm test` — green. 18/18 turbo tasks successful (apps/web 70/70 cases
  across 8 suites; content-sdk 18/18 cases including the leak-tests suite
  that was previously failing in PROGRESS).
- `pnpm build` — green. 11/11 turbo tasks successful, including the
  apps/web Next.js production build.
- `pnpm lint` — green. 11/11 turbo tasks successful.
- `researchcrafters validate ./content/packages/resnet` — exit 0.
- `researchcrafters validate ./content/templates/erp-basic` — exit 0.
- `docker compose ps` — Postgres + MinIO `Up (healthy)`; Redis container
  `Created` only (not `Up`). MinIO bucket bootstrap container exited 0.
- `curl -s http://localhost:3001/` — 200 OK.

Live module-presence checks all positive:

- `apps/web/auth.ts` exists; NextAuth v5 + Prisma adapter in
  `apps/web/package.json`.
- `apps/web/lib/data/{packages,enrollment}.ts` use real `await prisma.*`
  queries.
- `apps/web/lib/storage.ts` imports `@aws-sdk/client-s3` +
  `@aws-sdk/s3-request-presigner` and is the actual S3 adapter.
- `apps/web/lib/mentor-runtime.ts` imports both `AnthropicGateway` and
  `MockLLMGateway`; persists `MentorThread` + `MentorMessage` rows.
- `apps/web/lib/account-cascade.ts` exists and ships the cascade contract
  + runtime.
- `apps/web/app/api/account/{delete,export}/route.ts` both exist.
- `apps/web/app/api/admin/{render-share-card,rollup-branch-stats}/route.ts`
  both exist.
- `apps/web/app/auth/device/page.tsx` is the real browser approval UI
  (server actions for approve/deny against `prisma.deviceCodeFlow`).
- `apps/worker/src/{scheduler,admin}.ts` both exist.
- `apps/runner/src/sandboxes/local-fs.ts` exists.
- `.claude/hooks/block-dangerous-commands.py` exists.
- `tests/e2e/{catalog-to-stage,regressions}.spec.ts` and
  `playwright.config.ts` all exist.
- `packages/db/prisma/migrations/0_init/migration.sql` exists.
- `packages/content-sdk/src/index.ts` exports `runStageLeakTests` and
  `defaultLeakTestGatewayFactory`.
- `apps/web/lib/permissions.ts` — fully `async` Prisma-backed; `u-paid`
  / `u-stub` synthetic branches removed.
- `.github/workflows/ci.yml` — runs lint, typecheck, test, Playwright
  install + e2e, AND a per-package `researchcrafters validate` sweep.

Live bug surface still present:

- `/api/packages` route at `apps/web/app/api/packages/route.ts:22` still
  returns `listPackages()` without `await`, so JSON body is `{ packages:
  {} }`. (Sibling agents confirm the same bug at
  `/api/enrollments/:id/graph`.)
- Tailwind v4 utility scanning gap on `packages/ui` — sibling browser/FE
  QA caught this; the layout overflow blocks visual sign-off.
- Submission → runner → evaluator → grade is still not wired end-to-end:
  finalize creates a queued `Run` row but does not enqueue the BullMQ
  `submission_run` job.
- `node_traversals` and `share_cards` API routes return synthesized IDs
  rather than persisting Prisma rows.
- Redis container not `Up`, blocking BullMQ worker live execution.

## Per-file edit count

- `TODOS/PROGRESS.md` — 3 line edits:
  - Banner date `2026-05-07` → `2026-05-08`.
  - Mentor `Built` block: added line about `mentor-runtime.ts` + Anthropic
    fallback + persistence.
  - Mentor `Open today` / Gaps: removed "rows actually written from web
    /api/mentor/messages to Postgres" item (already shipped).
  - Net: 0 checkbox flips (this file uses prose, not checkboxes), 1
    Built bullet added, 1 Gap bullet removed, 1 banner update.
- `TODOS/00-roadmap.md` — 5 checkbox flips inside the Phase 3 block:
  - `Add mentor context builder` `[ ]` → `[x]`.
  - `Add evaluator leak tests and redaction checks` `[ ]` → `[x]`.
  - `Add telemetry for branch selection, feedback unlock, mentor
    requests, and share cards` `[ ]` → `[x]`.
  - The other Phase 3 items got annotated explanations but stayed `[ ]`
    (mentor leak tests in CI, prompt caching + rate limits, share-card
    payload generation, branch_stats rollups). Banner already
    `2026-05-08` from a sibling agent.
- `TODOS/01-mvp-platform.md` — already reconciled by sibling agent
  (banner `2026-05-08`; checkbox states reflect verified failures from
  the API/CLI QA agents). 0 edits this pass.
- `TODOS/02-erp-content-package.md` — already accurate. 0 edits.
- `TODOS/03-cli-runner.md` — already reconciled by sibling agent
  (`developer_force_approve` → real browser approval UI was already
  flipped to `[x]`). 0 edits.
- `TODOS/04-validation-evaluator.md` — already reconciled
  (`runStageLeakTests` exports already flipped to `[x]`, validate sweep
  in CI flipped to `[x]`). 0 edits.
- `TODOS/05-mentor-safety.md` — 2 checkbox flips `[ ]` → `[x]`:
  - `Store mentor threads and messages` `[ ]` → `[x]` with citation.
  - `Persist mentor_messages rows ...` `[ ]` → `[x]` with citation.
- `TODOS/06-data-access-analytics.md` — 1 line edit:
  - "Add privacy plumbing" Open-gaps bullet rewritten to acknowledge
    that data export endpoint and deletion cascade workflow have landed
    (encryption-at-rest remains).
- `TODOS/07-alpha-launch.md` — already accurate. 0 edits.
- `TODOS/08-infra-foundations.md` — 1 checkbox flip `[ ]` → `[x]`:
  - `Add user data export endpoint behind authentication` flipped with
    citation to `apps/web/app/api/account/export/route.ts`.
- `TODOS/09-frontend-design.md` — already reconciled. 0 edits.
- `TODOS/10-integration-quality-gaps.md` — 1 banner update
  (`2026-05-07` → `2026-05-08`); body already contains the verified
  failure list from a sibling QA agent.

## Top 3 truth-vs-doc deltas worth highlighting

1. **Mentor message persistence is shipped, not pending.**
   `apps/web/lib/mentor-runtime.ts` (lines 322, 333, 343, 354) actually
   creates `MentorThread` + `MentorMessage` Prisma rows on every mentor
   request, with full token telemetry. PROGRESS.md and
   `05-mentor-safety.md` were both still listing this as a gap.

2. **Account data export endpoint exists and is exercised by tests.**
   `apps/web/app/api/account/export/route.ts` calls
   `exportAccount` from `lib/account-cascade.ts`. The cascade module is
   covered by `lib/__tests__/account-cascade.test.ts` (8 cases passing).
   `08-infra-foundations.md` and `06-data-access-analytics.md` were
   both still listing the export endpoint as pending.

3. **CI per-package validate sweep has landed (and Playwright runs in CI
   too).** `.github/workflows/ci.yml` walks every directory under
   `content/packages/` and runs `researchcrafters validate` on each;
   the same workflow runs `pnpm test:e2e` after installing Chromium.
   The previous PROGRESS.md "in flight" annotation around CI sweep was
   stale — this had already been corrected by a sibling agent in
   `04-validation-evaluator.md` and `08-infra-foundations.md`, but
   PROGRESS.md still referenced the older state in places.

## Files not touched

By policy this agent did not edit:

- `TODOS/qa/{api,cli,content,fe,test-coverage}-qa-report.md` — owned by
  sibling QA agents.
- `TODOS/README.md` — repo index; out of scope.
- Source code, schemas, content packages, configs.
