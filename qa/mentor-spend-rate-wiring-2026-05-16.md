# QA — Mentor SpendStore and RateLimiter web-app wiring

- **Backlog item:** `backlog/05-mentor-safety.md` > Open gaps from snapshot
  > "Wire production `SpendStore` and `RateLimiter` implementations from the
  web app rather than relying on the interfaces shipped in `packages/ai`."
- **Branch:** `skynet/pr/mentor-spend-rate-wiring-2026-05-16`
- **Date:** 2026-05-16

## Scope tested

- New modules in `apps/web/lib/mentor/`:
  - `spend-store.ts` — `InMemoryMentorSpendStore` implementing `SpendStore`
    from `@researchcrafters/ai`, plus `defaultMentorSpendStore()` factory.
  - `rate-limiter.ts` — `MentorRateLimiter` interface and
    `InMemoryMentorRateLimiter` (sliding per-user and per-(user, package)
    windows), plus `defaultMentorRateLimiter()` factory.
- Wiring in `apps/web/lib/mentor-runtime.ts`:
  - Optional `userId`, `rateLimiter`, `spendStore`, `priceTable` inputs.
  - Pre-gateway rate-limit gate that returns a `rate_limited` outcome
    (skipping context build, gateway, persistence) and emits a
    `mentor_rate_limited` telemetry event.
  - Post-gateway `recordSpend` call against the priced token counts.
  - `defaultMentorPriceTable()` helper alongside existing model constants.
- Route wiring in `apps/web/app/api/mentor/messages/route.ts`:
  - Passes `session.userId`, `defaultMentorRateLimiter()`, and
    `defaultMentorSpendStore()` into the runtime.
  - Maps the `rate_limited` outcome to HTTP 429 with `Retry-After` and
    authored `mentorRefusal({ scope: "rate_limit" })` copy.
- Telemetry vocabulary in `packages/telemetry/src/events.ts`:
  - New `MentorRateLimitedEvent` joined into the `TelemetryEvent` union.
- Web telemetry surface in `apps/web/lib/telemetry.ts`:
  - `mentor_rate_limited` added to the `TelemetryEvent` union.

## Commands run

From `.skynet-wt/spend-rate-wiring/`:

- `pnpm --filter @researchcrafters/web exec vitest run lib/mentor lib/__tests__/mentor-runtime.test.ts lib/__tests__/route-mentor-messages.test.ts`
  - **Result:** 4 files, 31 tests, all pass (884ms).
- `pnpm --filter @researchcrafters/telemetry test`
  - **Result:** 1 file, 7 tests, all pass.
- `pnpm --filter @researchcrafters/ai test`
  - **Result:** 3 files, 22 tests, all pass.
- `pnpm --filter @researchcrafters/web typecheck`
  - **Result:** Two pre-existing errors only — `apps/web/lib/data/enrollment.ts`
    and `apps/web/lib/__tests__/data/enrollment.test.ts` referencing a
    missing `verified` field on `EvidenceItem`. Confirmed via
    `git diff origin/main` that neither file is touched by this change;
    these errors reproduce on a clean `origin/main` worktree. Not in
    scope for this iteration.

## Coverage added

- `apps/web/lib/mentor/__tests__/spend-store.test.ts` (5 tests):
  sliding-window accumulation, pruning, zero-cost no-op, options
  validation, singleton factory.
- `apps/web/lib/mentor/__tests__/rate-limiter.test.ts` (6 tests):
  per-pair limit, per-user limit, window-expiry recovery, isolation
  across users/packages, options validation, singleton factory.
- Two new cases in `apps/web/lib/__tests__/mentor-runtime.test.ts`:
  - `rate_limited` outcome short-circuits the gateway, persistence, and
    leak-test path, and emits the `mentor_rate_limited` event.
  - `recordSpend` is called with priced USD on the happy path; skipped
    when `userId` is omitted.
- Two new cases in `apps/web/lib/__tests__/route-mentor-messages.test.ts`:
  - HTTP 429 with `Retry-After` header and authored refusal copy.
  - Runtime receives `userId`, `rateLimiter`, and `spendStore` from the
    route.

## Result

**PASS.** The web app now owns the concrete production implementations of
`SpendStore` and `MentorRateLimiter`. The runtime calls them on every
authenticated mentor request, the route plumbs them in from the session,
and the 429 path uses authored refusal copy (the model never composes
the rate-limit message).

## Remaining risks / follow-ups

- The shipped implementations are in-memory and single-process. The
  multi-instance Redis-backed variants are still tracked as open gaps in
  `backlog/05-mentor-safety.md` (rate limiter, spend tracker, and context
  cache share this follow-up). Production-on-a-single-replica is safe;
  fan-out across replicas is not.
- The 80%/100% budget-cap alerts and the gateway-level `checkBudget`
  pre-flight refusal are still wired only through `packages/ai`'s
  `checkBudget` — they are not called from the runtime yet. Follow-up
  item should land a `checkBudget` pre-flight in the same place as the
  rate-limit gate, using `defaultMentorSpendStore()`.
- Default rate caps (60/min per user, 30/min per (user, package)) are
  authored from gut feel; should be reviewed against observed gateway
  throughput once the runtime emits the matching event in production.
