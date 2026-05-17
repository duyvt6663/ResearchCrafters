# QA: Backlog batch — emit telemetry events (`package_viewed` … `branch_feedback_unlocked`)

**Date:** 2026-05-17
**Backlog refs:** `backlog/06-data-access-analytics.md:98-103`
**Workflow item (primary):** `f03112c0-f678-4507-a259-d6315ae4228f`
**Workflow items (related, claimed in batch):**

- `105f68b6-b6de-4b2d-a14b-28d9c48d0fca` — Emit `enrollment_started`
- `458150ba-e95c-440e-9c64-36b8bfb7dce1` — Emit `stage_loaded`
- `c53bf4a2-fd14-4f0f-ac30-3522198e43c2` — Emit `stage_attempt_submitted`
- `698c4778-2397-4861-b580-21f2932c6feb` — Emit `branch_selected`
- `75180030-7b5e-4f66-a233-759112cf9da1` — Emit `branch_feedback_unlocked`

## Scope

Six telemetry-emit bullets from `backlog/06 §Telemetry`. Five of the six
were already emitted on `main`; this iteration audits each emit site and
adds the missing one (`branch_feedback_unlocked`).

## Result per event

| Event | Status | Emit site(s) on this branch |
| --- | --- | --- |
| `package_viewed` | already wired | `apps/web/app/page.tsx:25` (catalog), `apps/web/app/packages/[slug]/page.tsx:117` (overview) |
| `enrollment_started` | already wired | `apps/web/app/api/packages/[slug]/enroll/route.ts:128` |
| `stage_loaded` | already wired | `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx:62` |
| `stage_attempt_submitted` | already wired | `apps/web/app/api/stage-attempts/route.ts:64`, `apps/web/app/api/submissions/route.ts:169` |
| `branch_selected` | already wired | `apps/web/app/api/node-traversals/route.ts:70` |
| `branch_feedback_unlocked` | **newly wired** | `apps/web/app/api/runs/[id]/callback/route.ts` (after `runner_job_completed`) |

## What changed

`apps/web/app/api/runs/[id]/callback/route.ts`:

- Extended the `prisma.run.findUnique` projection to include
  `submission.stageAttempt.{enrollmentId, stageRef, branchId}` so the
  callback has the tuple the audit-grade event payload requires without
  a second round-trip.
- Added a post-`runner_job_completed` block that fires
  `branch_feedback_unlocked` when **all three** of:
  - `body.status === "ok"` (the runner reported a clean finish),
  - `body.gradeId` is present (a grade row was recorded), and
  - the stage attempt has a `branchId` (the learner actually picked a
    branch — i.e. this is a decision-bearing stage).
  The decision node is resolved via `prisma.nodeTraversal.findFirst`
  for the (enrollment, branch) pair, ordered by `selectedAt desc`. If
  no traversal is found, the event is skipped (best-effort —
  telemetry must never block the callback).
- All new Prisma calls go through `withQueryTimeout` and are wrapped in
  a local `try { … } catch { decisionNodeId = null }` so a slow or
  missing traversal does not error the callback.

`apps/web/lib/__tests__/route-runs-callback.test.ts`:

- Added mocks for `prisma.stageAttempt.update` (existed but was not
  declared in the mock surface) and the new
  `prisma.nodeTraversal.findFirst`.
- Extended the default `runFindUnique` payload with the
  `submission.stageAttempt` shape the route now selects, so existing
  tests still see a populated tuple.
- Three new regression cases:
  1. emits `branch_feedback_unlocked` when status=ok + gradeId + branchId,
  2. does **not** emit when status≠ok (e.g. `timeout`),
  3. does **not** emit when the stage attempt has no branch.

`backlog/06-data-access-analytics.md`: marked all six emit bullets as
done with inline pointers to the emit sites.

## Why these placements

- `package_viewed`, `enrollment_started`, `stage_loaded`,
  `stage_attempt_submitted`, `branch_selected` already fire from the
  obvious read/write paths that perform the action; no movement needed.
- `branch_feedback_unlocked` is audit-grade per
  `packages/telemetry/src/events.ts AUDIT_GRADE_EVENTS` and per the
  retention note in `apps/web/lib/account-cascade.ts`. Branch feedback
  becomes available the moment a grade is recorded against a stage
  attempt that selected a branch, so the runner callback (the canonical
  grade-arrival hook) is the right place to emit it. Re-emitting from
  the stage page on every render would over-count; emitting from the
  runner callback fires it exactly once per (attempt, branch) tuple.

## Verification

```
cd apps/web && ./node_modules/.bin/vitest run \
  lib/__tests__/route-runs-callback.test.ts
# 10 tests passed (7 existing + 3 new branch_feedback_unlocked cases)

cd apps/web && ./node_modules/.bin/vitest run \
  lib/__tests__/route-stage-attempts.test.ts \
  lib/__tests__/route-submissions-init.test.ts \
  lib/__tests__/route-node-traversals.test.ts \
  lib/__tests__/telemetry.test.ts
# 22 tests passed across 4 files
```

Total: 32/32 across the touched + adjacent telemetry suites.

## Residual risks

- `branch_feedback_unlocked` is only emitted on the runner callback
  path. Stages whose grade is published outside the runner (e.g. a
  future direct grade-creation hook) would need their own emit. None
  exist on `main` today, so the coverage matches reality.
- `decisionNodeId` is sourced from the **latest** `NodeTraversal` for
  the (enrollment, branch) pair. If a learner re-traversed the same
  branch via a different decision node, the more recent decision node
  wins — acceptable for analytics; not a correctness concern.
- The PostHog event payload still goes through the existing
  `apps/web/lib/telemetry.ts` wrapper, which falls back to a structured
  stderr log when `POSTHOG_API_KEY` is unset. No vendor-side
  verification was attempted in this iteration; that is covered by the
  prior `qa/telemetry-track-wired-2026-05-15.md` report.
