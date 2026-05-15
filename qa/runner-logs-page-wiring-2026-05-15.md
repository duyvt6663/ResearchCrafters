# QA Report — Runner logs page wiring (`runId` plumbing)

**Date:** 2026-05-15
**Backlog item:** `backlog/01-mvp-platform.md:21` — `Show runner logs and execution failure states.`
**Predecessor:** `qa/run-logs-and-execution-failure-2026-05-15.md` (UI half + back-end half landed). The remaining gap was the page-level `runId` plumbing.

## Scope

The CLI stage page (`apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx`) rendered `<RunStatusPanel stageRef={stage.ref} />` without a `runId`, so the panel could never reach the live-polling path documented in `packages/ui/src/components/RunStatusPanel.tsx`. This iteration adds the missing data-layer helper and threads the resolved `runId` into the panel.

## Changes

- `apps/web/lib/data/enrollment.ts` — new `getLatestRunIdForStage(enrollmentId, stageRef)` helper. Looks up the latest `Run.id` via `Run → Submission → StageAttempt(enrollmentId, stageRef)`, using `orderBy createdAt desc` and `select: { id: true }`. Returns `null` when no Run row exists yet.
- `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx` — calls the helper for `code`/`experiment` stages, then spreads `{ runId }` onto `<RunStatusPanel>` only when a Run has been produced. Non-CLI stages skip the lookup.
- `apps/web/lib/__tests__/data/enrollment.test.ts` — added `prisma.run.findFirst` to the hoisted mock and two cases covering the `null` and present-row paths.

## Commands run

- `pnpm --filter @researchcrafters/web typecheck` — clean.
- `pnpm --filter @researchcrafters/web exec vitest run lib/__tests__/data/enrollment.test.ts` — **11/11 pass** (9 pre-existing + 2 new).

## Risks / remaining work

- The runner stub in `apps/worker/src/jobs/submission-run.ts` (`makeDefaultRunnerExecutor`) still synthesizes `executionStatus: 'ok'`. Real sandboxed dispatch is tracked under `backlog/03-cli-runner.md`. Until that lands, the panel will poll real Run rows with synthetic logs, which is the intended dev path.
- Polling is fixed at the panel's default 1.5 s cadence; SSE/BullMQ-push is still on the long-term follow-up list.

## Verdict

Page-level `runId` plumbing is in place. Combined with the prior UI + back-end iterations, the roadmap item `Show runner logs and execution failure states` no longer has a stub in the user-visible path.
