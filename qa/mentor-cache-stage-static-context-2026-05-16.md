# QA: Cache stage-static mentor context

- Backlog item: `[backlog/05-mentor-safety.md:42]` — "Cache stage-static context."
- Branch: `skynet/pr/mentor-cache-stage-static-context-2026-05-16`
- Date: 2026-05-16

## Scope tested

Adds a pluggable cache for the stage-static portion of `MentorContext` so
loader callbacks (artifact excerpts, rubric criteria, branch feedback) are
only invoked once per `(packageVersionId, stageId, visibility, policyDigest,
artifactRefs)` tuple instead of on every mentor turn.

Changes:
- `packages/ai/src/context-cache.ts` (new) — `MentorContextCache` interface,
  `InMemoryMentorContextCache` (TTL + FIFO max-entries eviction),
  `mentorContextCacheKey`, and `fnv1aDigest` helper.
- `packages/ai/src/context-builder.ts` — `BuildMentorContextInput` accepts
  optional `cache` and `policyDigest`. On hit, `buildMentorContext` returns
  the cached context with `attempt` refreshed (request-scoped) and skips
  every loader. The forbidden-`always`-scope guard still runs before the
  lookup.
- `packages/ai/src/index.ts` — re-exports the new symbols.
- `apps/web/lib/mentor-runtime.ts` — accepts an optional `contextCache`,
  exposes a process-wide `defaultMentorContextCache()` (TTL/max-entries
  configurable via `MENTOR_CONTEXT_CACHE_TTL_MS` and
  `MENTOR_CONTEXT_CACHE_MAX_ENTRIES`), and forwards it into
  `buildMentorContext`.
- `apps/web/app/api/mentor/messages/route.ts` — wires the default cache into
  the runtime call so every mentor request shares it.

## Commands run

```
cd packages/ai && pnpm typecheck         # passes
cd packages/ai && pnpm build             # passes
cd packages/ai && pnpm test              # 4 files / 35 tests / 0 failures
cd apps/web && pnpm exec tsc --noEmit    # only pre-existing `verified` errors
                                         # in lib/data/enrollment.ts remain
cd apps/web && pnpm exec vitest run \
    lib/__tests__/mentor-runtime.test.ts \
    lib/__tests__/route-mentor-messages.test.ts   # 16/16 pass
```

Pre-existing typecheck failures in `apps/web/lib/data/enrollment.ts` and its
test (`Property 'verified' does not exist on type 'EvidenceItem'`) are
unrelated to this task and present on `origin/main` before the change.

## Test additions

- `packages/ai/test/context-cache.test.ts` (new, 13 tests)
  - `InMemoryMentorContextCache`: returns undefined on miss, expires past
    TTL (deterministic via injected `now`), evicts the oldest entry under
    `maxEntries`, refreshes insertion order on re-insert.
  - `mentorContextCacheKey`: stable under artifact-ref reordering, splits
    keys by visibility state.
  - `fnv1aDigest`: deterministic and key-order independent, differs for
    different inputs.
  - `buildMentorContext` with cache: hit skips loaders, miss on visibility
    change, miss on policy digest change, explicit `policyDigest` honoured
    (hit even when policy object identity changes), absent cache loads
    fresh each call.
- `apps/web/lib/__tests__/mentor-runtime.test.ts` adds a wiring test that
  passes the same `InMemoryMentorContextCache` to two `runMentorRequest`
  calls for the same stage and asserts the cache stays at size 1, proving
  the runtime forwards the cache and the second call hits.
- `apps/web/lib/__tests__/route-mentor-messages.test.ts` mock for
  `@/lib/mentor-runtime` now exposes a stub `defaultMentorContextCache`
  alongside `runMentorRequest`.

## Result

PASS. The cache short-circuits stage-static loader work without touching the
visibility-guard semantics: the forbidden-`always` warning, `after_attempt`
/ `after_pass` / `after_completion` gating, and the
`mentor_redaction_targets` snapshot all still run from cached or fresh
contexts identically.

## Residual risks / follow-ups

- In-memory only. Multi-instance deployments will not share the cache; this
  is tracked alongside the Redis-backed rate limiter in the
  `backlog/05-mentor-safety.md` Open Gaps section.
- The default `policyDigest` is computed from the live `StagePolicy` JSON.
  When the web app starts mirroring a precomputed package digest, pass it
  via `policyDigest` so re-published packages invalidate cleanly without
  waiting for TTL.
- Cache invalidation on package re-publish is not wired yet; current
  workaround is the 5-minute TTL. Worth a follow-up backlog item if mentor
  authors hit it.
