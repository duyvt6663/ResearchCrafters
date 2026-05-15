# QA: Wire `lib/telemetry.ts` `track()` to a real analytics destination

**Date:** 2026-05-15
**Backlog ref:** `backlog/01-mvp-platform.md:125`
**Workflow item:** `923b8e69-9d2b-487a-b7ea-4ed5d17693dc`

## What changed

`apps/web/lib/telemetry.ts` was a structured-log stub. It now delegates to
the workspace `@researchcrafters/telemetry` package, which:

- Captures to PostHog when `POSTHOG_API_KEY` is set (via lazy
  `posthog-node` import in `packages/telemetry/src/init.ts`).
- Persists audit-grade events (`grade_created`, `grade_overridden`,
  `evaluator_redaction_triggered`, `subscription_started`,
  `branch_feedback_unlocked`) to the Postgres `Event` table through the
  shared `@researchcrafters/db` Prisma client.

The web-layer signature (`track(eventName, payload)`) is preserved so the
~14 existing route/page call sites do not change. The wrapper:

- Builds `{ name: event, ...payload }` and forwards it to the workspace
  `track`.
- Lifts the three string context keys (`userId`, `packageVersionId`,
  `stageRef`) from the payload into the `TrackContext` argument.
- Swallows workspace-track failures with a structured `console.warn`
  (best-effort delivery is the contract documented in
  `packages/telemetry/src/track.ts`).
- Keeps a structured `console.log` fallback **only** when
  `POSTHOG_API_KEY` is unset, so dev environments still see what would
  have been recorded.

## Why this is safe

- `@researchcrafters/telemetry` is already a workspace dependency of
  `apps/web` (declared in `apps/web/package.json`) and is tested
  independently in `packages/telemetry/test/track.test.ts`.
- The wrapper never throws — every external call is wrapped in
  `try/catch`, matching the prior stub's no-throw contract that callers
  rely on (e.g. `app/api/stage-attempts/route.ts:123` does not `await`
  inside additional error handling).
- Audit-grade persistence is gated by `isAuditGradeEvent(name)` inside
  the workspace package, so non-audit events do not touch Postgres.
- Type-cast at the wrapper boundary (`as unknown as
  WorkspaceTelemetryEvent`) is necessary because legacy callers pass an
  open `TelemetryPayload`. Runtime behavior matches the typed shapes —
  the workspace `track` only reads `event.name` and spreads the rest.

## Verification

```
cd apps/web && npx vitest run lib/__tests__/telemetry.test.ts
# 4 tests passed

cd apps/web && npx vitest run \
  lib/__tests__/telemetry.test.ts \
  lib/__tests__/route-stage-attempts.test.ts \
  lib/__tests__/route-runs-callback.test.ts \
  lib/__tests__/route-mentor-messages.test.ts \
  lib/__tests__/route-submissions-init.test.ts \
  lib/__tests__/route-submissions-finalize.test.ts \
  lib/__tests__/route-node-traversals.test.ts \
  lib/__tests__/route-auth-device-code.test.ts
# 51 tests passed across 8 files — every route that calls track()
```

The new `apps/web/lib/__tests__/telemetry.test.ts` (4 cases) pins:

1. Forwarding event name + payload and lifting `stageRef` into context.
2. Ignoring non-string context fields (e.g. `packageVersionId: null`).
3. Swallowing workspace-track rejections with a warn log.
4. Emitting the dev fallback log only when `POSTHOG_API_KEY` is unset.

## Pre-existing failures (out of scope)

`lib/__tests__/route-share-cards.test.ts` has 3 failures that reproduce
on the unmodified base file as well — they originate from the prior
iteration's `lib/data/share-cards.ts` calling real Prisma without
`DATABASE_URL` in the vitest environment. Tracked separately; this
backlog item does not touch share-card data plumbing.

## Operator note

To enable real analytics in any environment, set `POSTHOG_API_KEY` (and
optionally `POSTHOG_HOST`, default `https://us.i.posthog.com`). Audit
persistence requires a reachable Postgres pointed to by `DATABASE_URL`.
With neither configured, behavior matches the prior stub (stderr log
only).
