# QA Report — Run logs & execution failure handling (UI surface)

**Date:** 2026-05-15
**Backlog item:** `backlog/00-roadmap.md:67` —
`Add run logs and execution failure handling. _(stubbed)_`
**Scope of this iteration:** UI-side wiring inside
`packages/ui/src/components/RunStatusPanel.tsx`. The API route
(`/api/runs/[id]/logs`), runner-callback route
(`/api/runs/[id]/callback`), and worker job
(`apps/worker/src/jobs/submission-run.ts`) were already in place — see
those files for the back-end half of the handling.

## Summary

Two concrete stubs in `RunStatusPanel` blocked the roadmap rollup item:

1. The `stageRef` prop carried a `TODO: wire to API` and was never read
   by the component, so the panel rendered inside
   `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx:177` always
   showed the empty "No log lines." state.
2. The authored `executionFailure()` copy in
   `packages/ui/src/copy/execution-failure.ts` was exported but never
   shown anywhere — execution failures only surfaced as a small status
   badge.

This iteration wires both:

- `RunStatusPanel` gained a `runId` prop. When supplied, it polls
  `/api/runs/{runId}` and `/api/runs/{runId}/logs` on a 1.5 s cadence
  (configurable; set to 0 for a single fetch) and stops once the run row
  reaches a terminal status
  (`ok | timeout | oom | crash | exit_nonzero`).
- The fetcher is injectable (`fetchImpl` prop) for tests and SSR-only
  environments.
- The panel renders a `role=\"alert\"` failure banner above the log body
  whenever `executionStatus` resolves to
  `timeout | oom | crash | exit_nonzero`. The banner uses the
  pre-existing authored copy (title + body + retry hint) so wording
  stays in the typed copy library.
- A non-fatal "log fetch error" pill renders when the poll hits a
  network or 5xx; polling continues so the next tick can recover.
- The `stageRef` prop is kept for backwards compat with the existing
  call sites but is now documented as inert.

The page-level data plumbing — looking up the latest `runId` for an
enrollment/stage tuple so the server can pass it down to
`<RunStatusPanel runId=…>` — is still missing and is the natural next
follow-up. Until then, rendering the panel with `runId` from a client
component or storing the CLI-emitted run id in localStorage are both
viable bridges.

## Commands run

- `pnpm --filter @researchcrafters/ui typecheck` — clean.
- `pnpm --filter @researchcrafters/ui build` — clean.
- `pnpm --filter @researchcrafters/ui test` — **15 files, 73 tests, all
  pass.** The new file `packages/ui/test/run-status-panel.test.tsx`
  adds 7 SSR-rendered cases covering:
  - no banner when `executionStatus === \"ok\"`;
  - banner + authored copy for each of
    `timeout | oom | crash | exit_nonzero`;
  - log lines render alongside the banner;
  - `runId`-only render path produces the empty server shell without
    throwing.
- `pnpm --filter @researchcrafters/web typecheck` — clean.

## Files changed

- `packages/ui/src/components/RunStatusPanel.tsx` — added `runId`,
  `pollIntervalMs`, `fetchImpl` props; added poll-and-render
  `useEffect`; added failure banner; routed badge through derived
  `effectiveExecutionStatus` and `fetchedRunStatus → StatusKey` mapping.
- `packages/ui/test/run-status-panel.test.tsx` — new SSR tests.

## Remaining risks / follow-ups

- **Page wiring**:
  `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx` still
  passes `stageRef` only. To surface a real run, look up the latest Run
  row for `(enrollmentId, stageRef)` (server side via Prisma) and
  thread it through to the panel as `runId`. This requires extending
  `apps/web/lib/data/enrollment.ts` with a `getLatestRunForStage()`
  helper or similar.
- **Polling cost**: 1.5 s fixed cadence is fine for the MVP product
  loop but should switch to SSE or BullMQ-driven push once production
  volume warrants it.
- **executionStatus enum drift** — the QA note in
  `qa/api-qa-report.md` finding #6 about `succeeded | failed` vs.
  `ok | exit_nonzero` is unchanged by this iteration; the panel only
  consumes the contract enum
  (`ok | timeout | oom | crash | exit_nonzero`) and is unaffected.
- **Real runner**: `makeDefaultRunnerExecutor` in the worker is still
  a stub that synthesizes `ok`. Tracked separately under
  `backlog/03-cli-runner.md` "Runner Modes" / runner-loop agent.

## Verdict

UI half of the roadmap rollup is no longer stubbed — `RunStatusPanel`
ships the live data path and the authored failure surface. The
roadmap item stays partially open until page-level `runId` plumbing
lands, which is logged above as a follow-up.
