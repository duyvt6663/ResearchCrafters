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

---

## Addendum 2026-05-17 — next telemetry slice (lines 105–110)

**Backlog refs:** `backlog/06-data-access-analytics.md:105-110`
**Workflow item (primary):** `d33d5a3c-3a5e-4a41-9d29-6b585b440b6f` — Emit `runner_job_started`
**Workflow items (related, claimed in batch):**

- `d9af6329-89c7-4c29-a221-ce9ca44daf7e` — Emit `runner_job_completed`
- `5f8f57ae-fb83-435a-ac58-c21a3b460e01` — Emit `grade_created`
- `08c8f80d-218e-4a9f-9ccc-8c6dfe83c1cf` — Emit `grade_overridden`
- `40ae83bc-9883-4975-8d98-45795e13efb6` — Emit `evaluator_redaction_triggered`
- `39320ab8-f932-42a2-831f-a1e7e5fe3415` — Emit `mentor_hint_requested`

### Scope

Six telemetry-emit bullets from `backlog/06 §Telemetry` covering the
runner-job + grading + mentor-hint path. Five of the six were already
emitting on this branch; this iteration audits each emit site and adds
the missing one (`grade_created`).

### Result per event

| Event | Status | Emit site(s) on this branch |
| --- | --- | --- |
| `runner_job_started` | already wired | `apps/web/app/api/submissions/[id]/finalize/route.ts:275` |
| `runner_job_completed` | already wired | `apps/web/app/api/runs/[id]/callback/route.ts:268` |
| `grade_created` | **newly wired** | `apps/worker/src/jobs/submission-run.ts` (right after grader returns + StageAttempt mirror) |
| `grade_overridden` | already wired | `apps/web/app/api/grades/[id]/override/route.ts:98` |
| `evaluator_redaction_triggered` | already wired | `apps/web/lib/mentor-runtime.ts:279, 317, 387, 403` |
| `mentor_hint_requested` | already wired | `apps/web/app/api/mentor/messages/route.ts:118` |

### What changed

`apps/worker/src/jobs/submission-run.ts`:

- Imported `track` from `@researchcrafters/telemetry`.
- After the grader returns a non-null `GradeRow` and the
  `StageAttempt` mirror (`gradeId`, `passed`, `score`) is written,
  fire `track({ name: 'grade_created', ... })` with the
  (`gradeId`, `submissionId`, `stageAttemptId`, `rubricVersion`,
  `evaluatorVersion`, `passed`, `score`) tuple required by
  `GradeCreatedEvent`. `score` is conditionally included only when
  numeric so unscored rubrics omit the field cleanly. The grader is
  idempotent on `(submissionId, rubricVersion, evaluatorVersion)`, so
  retries return the same `grade.id` and the dual-write Event sink
  dedupes on `event_uuid`.

`apps/worker/test/submission-run.test.ts`:

- Wired the audit-grade Event store seam (`setEventStoreForTests` +
  `_resetTelemetryForTests` + `initTelemetry({})`) in `beforeEach`/
  `afterEach`, capturing every audit-grade event the run path emits.
- Extended the existing `runnerMode=test happy path` test to assert
  `grade_created` is captured exactly once with the full payload tuple.
- Extended the `runnerMode=replay hash mismatch` test to assert that no
  `grade_created` event is emitted when grading is skipped.

`backlog/06-data-access-analytics.md`: marked all six bullets done with
inline pointers to the emit sites.

### Why this placement for `grade_created`

The worker job is the single, idempotent point where a Grade row
becomes durable. Emitting from the runner callback (where
`runner_job_completed` and `branch_feedback_unlocked` already fire)
would either skip stages whose grader runs synchronously in-job or
risk double-emitting; emitting from the API layer would miss
worker-side grades altogether. The post-grader site fires once per
newly-created grade and inherits the grader's idempotency contract.

### Verification

```
cd .skynet-wt/telemetry-emit/apps/worker && \
  ./node_modules/.bin/vitest run test/submission-run.test.ts
# 7 tests passed (5 existing + 2 with grade_created assertions)

cd .skynet-wt/telemetry-emit/apps/worker && pnpm typecheck
# clean
```

### Residual risks

- `grade_created` is emitted only from `submission-run.ts`. If a
  future code path writes a Grade row outside this job (e.g. a
  reviewer-initiated synthetic grade), that path needs its own emit.
  No such path exists on this branch.
- The Event store seam captures audit-grade events for the assertion;
  the PostHog write goes through `getPostHogClient` which is a no-op
  without `POSTHOG_API_KEY`. The test does not exercise the PostHog
  side; that is covered by `packages/telemetry/test/track.test.ts`.


---

## Addendum 2026-05-17 — mentor_feedback_requested + share_card_created

**Backlog refs:** `backlog/06-data-access-analytics.md:111,113`
**Workflow item (primary):** `72eedbdf-2833-404e-9025-964b62fe4a9c` — Emit `mentor_feedback_requested`
**Workflow items (related, claimed in batch):**

- `bc20f045-30f3-4d51-a020-6aeff2ab7c9b` — Emit `share_card_created`

### Scope

Two telemetry-emit bullets from `backlog/06 §Telemetry`. Both were
already emitted on this branch; this iteration audits each emit site
and ticks the backlog with inline pointers.

The three remaining bullets in this section (`stage_completed`,
`paywall_viewed`, `subscription_started`) require new emit sites — and,
for `paywall_viewed`, deciding whether the existing device-auth
recycle of the event name should count or whether a learner-facing
paywall surface still needs to land first. They are intentionally left
unclaimed for a follow-up iteration.

### Result per event

| Event | Status | Emit site(s) on this branch |
| --- | --- | --- |
| `mentor_feedback_requested` | already wired | `apps/web/app/api/mentor/messages/route.ts:123` (the `else` branch from `mentor_hint_requested` — fires for `feedback` / `explain_branch` modes) |
| `share_card_created` | already wired | `apps/web/app/api/share-cards/route.ts:104` (initial row creation, no `publicSlug` yet), `apps/worker/src/jobs/share-card-render.ts:91` (re-emit after render job assigns `publicSlug`) |

### What changed

Code: nothing. Both emissions were wired in earlier iterations and the
payloads already match the typed shapes in
`packages/telemetry/src/events.ts` (`MentorFeedbackRequestedEvent` and
`ShareCardCreatedEvent`).

`backlog/06-data-access-analytics.md`: marked both bullets `[x]` with
inline pointers to the emit sites; called out that
`mentor_feedback_requested` omits the optional `threadId` because the
mentor thread row is created later in the runtime call.

### Why these placements

- `mentor_feedback_requested` lives in the same `else` arm as
  `mentor_hint_requested` in the mentor messages route, so the two
  request modes share a single, audited emission point — the only
  place where the policy-gated mentor request is actually accepted.
  Emitting later in the runtime would miss requests refused by the
  policy gate after access is granted but before the runtime hands
  off.
- `share_card_created` is emitted twice deliberately: once at row
  creation (the user-visible "I just shared" event) and once after
  the render worker assigns the durable `publicSlug` (so analytics
  can correlate creation with the public URL). Both emissions carry
  the same `shareCardId` so PostHog dedupes naturally on
  `(distinct_id, shareCardId)`; the renderer-side emission adds
  `publicSlug` once known, which is the only field that distinguishes
  the two payloads.

### Verification

```
cd .skynet-wt/telemetry-emit/apps/web && \
  ./node_modules/.bin/vitest run \
    lib/__tests__/route-mentor-messages.test.ts \
    lib/__tests__/route-share-cards.test.ts
# expected: existing assertions for `mentor_feedback_requested`
# (route-mentor-messages.test.ts:164) and `share_card_created`
# (route-share-cards.test.ts:183) continue to pass — no code changes.
```

No code changes; verification is limited to the existing regression
tests already asserting each event's emission. The PostHog dispatch
path is exercised by `packages/telemetry/test/track.test.ts`.

### Residual risks

- `mentor_feedback_requested` does not carry `threadId`. If a future
  dashboard wants to correlate the request with the eventual mentor
  thread row, the route would need to thread the freshly-created
  `threadId` back into the emission (or emit a follow-up
  `mentor_thread_created` event). Acceptable today because the
  primary use case is rate / volume tracking against the request,
  not per-thread attribution.
- `share_card_created` fires twice per share (creation + render).
  Downstream dashboards must group on `shareCardId`, not raw event
  count, to avoid double-counting; PostHog funnels naturally collapse
  these because `distinct_id`/`shareCardId` are stable across both
  emissions.
- `stage_completed`, `paywall_viewed`, and `subscription_started`
  remain unticked. The first needs a real emit site (likely in the
  runner callback path next to `branch_feedback_unlocked` once a
  "stage passed" boolean is materialized); the latter two need real
  product surfaces (paywall route + billing webhook) before emission
  is meaningful.
