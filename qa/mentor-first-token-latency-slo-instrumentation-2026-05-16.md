# QA — Mentor first-token latency SLO instrumentation

- Backlog items:
  - `backlog/05-mentor-safety.md:90` — p95 mentor first token for hints under 5 seconds.
  - `backlog/05-mentor-safety.md:91` — p95 mentor first token for writing feedback under 15 seconds.
- Branch: `skynet/pr/mentor-cache-stage-static-context-2026-05-16` (dirty worktree from prior backlog iterations; this change is scoped to the SLO instrumentation only).
- Date: 2026-05-16.

## Scope

The two SLOs are measurement targets — they cannot be "implemented" without a way to observe latency per request. This change adds the missing observation point.

- New audit-friendly telemetry event `mentor_first_token_latency` in `packages/telemetry/src/events.ts`, exported from `packages/telemetry/src/index.ts`.
- `apps/web/lib/mentor-runtime.ts` now times `gateway.complete(...)` and emits the new event for every mentor request with the authored per-mode SLO threshold (`sloMs`) and a per-request `withinSlo` boolean.
- `MENTOR_FIRST_TOKEN_SLO_MS = { hint: 5000, feedback: 15000 }` exported from the runtime so other call sites (dashboards, alerts, future load tests) read the same source of truth as the backlog file.
- The `LLMGateway` interface is non-streaming today, so `latencyMs` is measured as the duration of `gateway.complete(...)`. When streaming lands, the same start marker pairs with the first-chunk timestamp; the event shape and SLO thresholds do not change.
- `apps/web/lib/telemetry.ts` `TelemetryEvent` union extended with `"mentor_first_token_latency"` so the web-side dispatch surface stays in lockstep with the runtime.
- Backlog checkboxes ticked with implementation notes on `backlog/05-mentor-safety.md`.

## Out of scope

- The `mentor_spend_cap_alert` event already declared in the runtime's local `TelemetryEventName` is still missing from `apps/web/lib/telemetry.ts`. That gap predates this change (introduced by the open spend-tracker work that has not landed cleanly) and is not retouched here.
- Production SLO dashboard / PostHog query is downstream of this telemetry stream; not in scope for the runtime change.

## Commands

```
cd apps/web && pnpm exec vitest run lib/__tests__/mentor-runtime.test.ts
cd packages/telemetry && pnpm exec vitest run
```

Both green.

```
 ✓ apps/web/lib/__tests__/mentor-runtime.test.ts (15 tests) 9ms
 ✓ packages/telemetry/test/track.test.ts            (7 tests) 5ms
```

New focused case: `runMentorRequest > emits mentor_first_token_latency tagged with the per-mode SLO threshold` exercises both `mode: "hint"` and `mode: "feedback"` and asserts the payload carries `enrollmentId`, `stageRef`, `mode`, `modelTier`, `modelId`, a numeric `latencyMs`, the correct `sloMs` (5000 / 15000), and a boolean `withinSlo`.

## Typecheck

`cd apps/web && pnpm exec tsc --noEmit` was run pre-edit and post-edit. The pre-edit baseline already had two unrelated errors from dirty worktree changes (`EvidenceItem.verified`) and several `@researchcrafters/db` / `@researchcrafters/ai` export gaps from the in-flight spend-tracker / grade-store work. No new errors are introduced by this change; the only telemetry-related mismatch (`mentor_spend_cap_alert`) is pre-existing.

## Residual risks

- The non-streaming gateway means `latencyMs` overstates true first-token latency once a streaming adapter is added. The doc + event shape make the swap trivial.
- The runtime now emits one extra `track(...)` call per mentor request. The default no-op `track` in the runtime input keeps unit tests free of side effects, and the live `track()` already runs best-effort (failures are logged, not thrown) so the new event cannot break a mentor response.
- `withinSlo` is computed per-request; p95 must still be computed downstream on the event stream. The boolean is purely a convenience for "% of requests within SLO" dashboards.
