# QA — Store immutable share-card payload snapshot

- **Date:** 2026-05-17
- **Backlog:** `backlog/06-data-access-analytics.md` §Share Cards lines 146–153
  - Store immutable share-card payload snapshot
  - Include package slug and version
  - Include completion status
  - Include score summary
  - Include hardest decision when available
  - Include selected branch and branch type
- **Workflow items:**
  - `01b4cca7-a479-4c16-b16b-51d0f52582ec` (primary)
  - `57be46cd-6162-43ab-b5da-edf8449b0163`, `7735ac1a-c01a-4f24-8ba8-5378d57a7fd9`,
    `71d9f171-cf97-49d3-a860-bebaf8f137b2`, `63a3b503-9e3e-4853-aa02-e34b3c517919`,
    `f571445a-ff1f-43d3-8822-d577a9b89198` (claimed-related field bullets)
- **Branch:** `skynet/pr/mentor-cache-stage-static-context-2026-05-16`
  (dirty worktree; this change is scoped to share-card files only).

## Scope

`POST /api/share-cards` previously returned a synthesized `sc-${Date.now()}`
identifier and never wrote a row, even though the Prisma `ShareCard` model and
the `createShareCard` data wrapper already existed. The route is now the single
chokepoint that materializes an immutable `ShareCardPayload` snapshot and
persists it under a freshly-generated `publicSlug`. The snapshot carries every
field listed in backlog/06 §Share Cards lines 146–153.

## Files changed

- `apps/web/app/api/share-cards/route.ts` — generate `publicSlug` synchronously
  via `@researchcrafters/worker.generatePublicSlug`, call
  `createShareCard({ userId, enrollmentId, packageVersionId, payload, publicSlug })`,
  return the persisted row's id + slug. Added a defensive `401` when the
  permission gate ever returned `allowed` without a `session.userId`.
- `apps/web/lib/__tests__/route-share-cards.test.ts` — added two focused tests:
  1. Persistence path: asserts `createShareCard` is called once with the
     snapshot payload (`packageSlug`, `packageVersionId`, `completionStatus`,
     `scoreSummary`, `hardestDecision`, `selectedBranchType`, `cohortPercentage`)
     plus the generated `publicSlug`, and that the response reflects the
     persisted id + slug.
  2. Defensive 401: when the session has no `userId` but `canAccess` returned
     `allowed`, the route does not call `createShareCard` /
     `generatePublicSlug` and responds 401.
- `backlog/06-data-access-analytics.md` — marked the six §Share Cards bullets
  complete with wired notes pointing to the route + this QA file.

## Snapshot field coverage

| Backlog bullet                       | Field in `ShareCard.payload`                        |
| ------------------------------------ | --------------------------------------------------- |
| Package slug and version             | `packageSlug`, `packageVersionId`                   |
| Completion status                    | `completionStatus` (`complete` / `in_progress`)     |
| Score summary                        | `scoreSummary = { passed, total }`                  |
| Hardest decision when available      | `hardestDecision` (omitted if neither input present)|
| Selected branch and branch type      | `selectedBranchType` (`failed` → `alternative`)     |

Cohort percentage stays suppressed (`null`) until persisted `node_traversals`
land — tracked as a separate open backlog item in the same section.

## Commands run

- `cd apps/web && pnpm vitest run lib/__tests__/route-share-cards.test.ts`
  → 11 passed (the 2 new tests + the 9 existing regressions including
  body-validation, auth/permissions, completion derivation, branch mapping).
- `cd apps/web && pnpm vitest run lib/__tests__/share-cards.test.ts \
   lib/__tests__/share-card-urls.test.ts \
   lib/__tests__/route-share-card-image.test.ts \
   lib/__tests__/route-public-share-page.test.tsx`
  → 41 passed (no regressions in payload builder, URL builders, image route,
  or public share page).

## Risks / follow-ups

- `apps/worker/src/jobs/share-card-render.ts` still generates a fallback slug
  on first render. With the route now writing the slug at creation time, the
  worker's slug branch becomes a no-op (its own test pins idempotency when
  `publicSlug` is already set), and the worker is now responsible only for
  the visual asset render. Left untouched to keep the diff scoped.
- `pnpm typecheck` in `apps/web` reports pre-existing errors in unrelated
  files on this dirty worktree (`mentor-runtime`, `stage-attempts`,
  `grade-override`, `submissions`, `mentor/messages`). None reference
  `share-cards`. They belong to other in-flight Skynet branches.
- Slug collisions on `publicSlug` (32^12 entropy ≈ 1.15e18) are not retried.
  If the unique constraint ever fires, the route surfaces a 500. Acceptable
  for first iteration; a single-retry on `P2002` is the obvious follow-up if
  collision telemetry ever appears.
- Cohort percentage suppression is deliberately `null`; the persisted
  snapshot does not yet support the cohort-percentage backlog bullet
  (line 154), which remains open and depends on persisted `node_traversals`.
