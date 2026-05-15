# QA: Abuse-Control Retry Budget Separated From Graded Attempts

Date: 2026-05-15
Branch: skynet/backlog/resnet-reviewer-rebuttal-2026-05-15
Backlog item: `backlog/03-cli-runner.md` §Execution Status
> Track abuse-control retry budget separately from graded attempts.

## Scope of this iteration

This iteration lands the **classification primitive**, not its consumers. The
runner rate-limiter, submission init route, and progress UI all need to
distinguish "graded attempt" (a learner-facing metric) from "retry budget"
(an abuse-control metric), but until now there was no shared rule for the
split. Each future call site would have re-derived the rule from
`executionStatus` and drifted out of sync.

A pure helper module is the right MVP shape:

- Pure functions, no Prisma or Redis coupling — drop-in for any caller.
- Tested exhaustively against every documented `executionStatus`.
- Caller chooses the row set (per user, per package, per window) — the
  primitive only owns the classification rule.

## Changes

### New: `apps/web/lib/abuse-budget.ts`

Three exports:

1. `classifyAttempt(executionStatus)` → `"graded" | "retry" | "pending" |
   "not_required"`.
   - `"ok"` → `graded`. Producing a grade is the only way to consume a
     graded-attempt slot.
   - `"timeout" | "oom" | "crash" | "exit_nonzero"` → `retry`. The runner
     spent real capacity; no grade was produced; the learner should not be
     penalized in the graded count.
   - `"queued" | "running" | null | undefined | ""` → `pending`. Not
     committed yet.
   - `"not_required"` → `not_required`. Writing/decision stages that bypass
     the runner.
   - Unknown strings fail safe to `pending` so a new status shipped without
     teaching the module about it can't retroactively re-grade learners.

2. `summarizeAttempts(rows)` → `AbuseBudgetSummary`. Pure reduce over
   `{ executionStatus }` shapes. Returns:
   - `gradedAttempts`
   - `retryAttempts`
   - `pendingAttempts`
   - `notRequiredAttempts`
   - `retryBudgetUsed = gradedAttempts + retryAttempts`

3. `checkAbuseBudget(summary, limit)` → `{ allowed: true } |
   { allowed: false, reason }`. Hard cap on `retryBudgetUsed`; non-finite or
   non-positive limits are treated as unbounded so callers that don't care
   about throttling can pass `0`.

### New: `apps/web/lib/__tests__/abuse-budget.test.ts`

18 tests pinning:

- Every documented `executionStatus` mapping in `classifyAttempt`.
- `null`/`undefined`/`""` → pending (the "no callback yet" case).
- Unknown statuses → pending (fail-safe).
- Empty list returns all-zero summary.
- Mixed list sums each bucket independently and computes
  `retryBudgetUsed = graded + retry` (pending intentionally excluded).
- A graded run that fails grading (`executionStatus = "ok"` but low score)
  still charges the abuse budget — the runner spent capacity.
- `checkAbuseBudget` allows, denies-at-limit, denies-above-limit, and
  treats `limit <= 0` / `Number.POSITIVE_INFINITY` as unbounded.

## Why this is not premature

- The `executionStatus` union is already documented in
  `packages/db/prisma/schema.prisma:429` and enforced by the runner callback
  route (`apps/web/app/api/runs/[id]/callback/route.ts`). The classification
  rule has stable inputs.
- The `RateLimiter` interface in `apps/runner/src/security.ts:108` is
  already a placeholder for the production limiter. A pure classifier means
  the eventual Redis-backed limiter can swap in without re-implementing the
  graded-vs-retry decision.
- Status / progress surfaces (the upcoming `status` command iterations, the
  account-cascade export, and any future learner-facing "attempts left"
  counter) all need the same split. Sharing it now prevents drift.

## What this iteration deliberately does NOT do

- No new HTTP endpoint, no schema migration. The
  `StageAttempt.executionStatus` column already carries the data we need.
- No live wiring to `apps/runner/src/security.ts`'s `InMemoryRateLimiter` —
  that limiter counts *requests*, not budget; merging the two is a separate
  follow-up that should also pick the budget refresh window.
- No UI changes. Consumers will adopt the helper as they need it; this MVP
  only owns the classification primitive.

## Verification

```
cd apps/web && pnpm exec vitest run lib/__tests__/abuse-budget.test.ts
# Test Files  1 passed (1)
# Tests       18 passed (18)

cd apps/web && pnpm exec tsc --noEmit
# (clean)
```

Both run locally against the current branch on 2026-05-15.

## Follow-ups (for the backlog, not this PR)

- Wire `summarizeAttempts` into the submissions/stage-attempts route to
  surface a per-user `retryBudgetUsed` in API responses.
- Wire `checkAbuseBudget` into the production rate-limiter once it's
  Redis-backed.
- Decide and document the abuse-budget refresh window (per-day per-package?
  per-hour per-user?). Out of scope for the tracking primitive.
