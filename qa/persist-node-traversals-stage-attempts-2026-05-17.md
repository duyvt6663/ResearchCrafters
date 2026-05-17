# QA: Persist node_traversals and stage_attempts from API routes

- Backlog item: `backlog/06-data-access-analytics.md:177` — "Persist
  `node_traversals` and `stage_attempts` from API routes instead of returning
  synthesized ids."
- Skynet workflow id: `9bff64fd-c978-4fc6-81bd-733548bee8c8`
- Branch: `skynet/pr/persist-node-traversals-stage-attempts-2026-05-17`
- Date: 2026-05-17

## Scope

Two Next.js Route Handlers previously returned synthesized
`sa-${Date.now()}` / `nt-${Date.now()}` ids without ever inserting into
Postgres. Analytics (`branch-stats-rollup`, share-card cohort percentages,
`/api/runs/[id]/callback` branch-feedback unlock) join on real `StageAttempt`
/ `NodeTraversal` cuids, so the synthesized ids were dropped on the floor
the moment they left the response.

This pass makes both routes durable-first with a synthesized fallback so
local dev / DB outages still return a usable shape and don't break the
existing callers that only read `response.id`.

Files changed:

- `apps/web/app/api/stage-attempts/route.ts` — wrap `prisma.stageAttempt.create`
  in `withQueryTimeout`, return the cuid; keep `sa-<ts>` fallback on error.
  Persisted columns: `enrollmentId`, `stageRef`, `answer` (defaults to `{}`
  when caller omits), `executionStatus: "queued"`, `patchSeq` (frozen via
  the existing `resolveActivePatchSeq` resolver).
- `apps/web/app/api/node-traversals/route.ts` — resolve the YAML refs the
  contract exposes (`nodeRef`, `branchId`) to the DB cuids the FKs require
  via the `(packageVersionId, nodeId)` and `(packageVersionId, branchId)`
  unique indexes, then `prisma.nodeTraversal.create`. `branchId` is
  nullable on the row so an unresolved branch still persists the traversal.
  A missing decision node forces the synthesized fallback because
  `NodeTraversal.decisionNodeId` is NOT NULL.
- `apps/web/lib/__tests__/route-stage-attempts.test.ts` — mock the new
  prisma surface (`stageAttempt.create`, `withQueryTimeout`); add coverage
  for the durable path (returned cuid, persisted column values) and the
  fallback path (`sa-<ts>` shape preserved on DB error).
- `apps/web/lib/__tests__/route-node-traversals.test.ts` — mock
  `decisionNode.findUnique`, `branch.findUnique`, `nodeTraversal.create`,
  `withQueryTimeout`; add coverage for (1) durable persistence with FK
  resolution, (2) FK miss on decision node forces `nt-<ts>` fallback,
  (3) null branch FK still persists, (4) DB-unreachable forces fallback.

## Verification

Commands run from the worktree at
`/Users/duyvt6663/github/ResearchCrafters/.skynet-wt/persist-traversals`:

```
# Focused regression for both routes.
apps/web $ npx vitest run \
    lib/__tests__/route-stage-attempts.test.ts \
    lib/__tests__/route-node-traversals.test.ts
```

Result: **PASS — 19/19** (10 stage-attempts + 9 node-traversals).

Note: a workspace-wide `tsc --noEmit` flags pre-existing errors against
`@researchcrafters/db` (`resolveActivePatchSeq`, `patchSeq`, grade-store
exports) that come from the symlinked-from-sibling-worktree
`packages/db/dist` being stale relative to the source. The same errors
reproduce in `app/api/submissions/route.ts` which is untouched on
`origin/main`. They are environmental (db dist not rebuilt in this
worktree) — CI runs `pnpm install && db:generate` and resolves them.
Vitest passes because vitest resolves the workspace package to source.

## Risk and follow-ups

- The fallback synthesized ids (`sa-<ts>`, `nt-<ts>`) still leak from the
  response when the DB is unreachable. Long-term we should probably 503
  instead so the client never persists a non-joinable id, but the current
  contract preserves the pre-existing shape — out of scope for this item.
- Branch FK is best-effort: if the (packageVersionId, branchId) unique
  lookup misses, the traversal still persists with `branchId = null`. The
  branch-stats rollup ignores null-branch traversals which matches the
  behavior we want for invalid client input — better than rejecting the
  traversal entirely.
- `StageAttempt.branchId` is not yet populated by the stage-attempts route
  (the contract has no branch context at attempt-creation time; branch is
  assigned later when the learner picks a decision). No change needed here.
- Tests for the related backlog items at lines 180 (branch-stats rollup),
  183 (events dual-write), 185 (migration UX), and 186 (encryption at rest)
  were NOT bundled into this iteration — each touches a different surface
  (worker, telemetry, web UI, db crypto) and would balloon the diff. Each
  stays in the backlog for its own claim.

## Status

QA PASS — backlog item ready to mark complete via skynet_backlog.
