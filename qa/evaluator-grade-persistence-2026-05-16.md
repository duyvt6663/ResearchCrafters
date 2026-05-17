# QA: Persist evaluator grades through packages/db

Backlog item: backlog/04-validation-evaluator.md — Persist evaluator grades through packages/db instead of the in-memory grade store.

## Scope tested

- New shared `makePrismaGradeStore` in `@researchcrafters/db` exposing `findByKey`, `insert`, and `appendOverride` against the Prisma `Grade` table.
- Reviewer-override path (`apps/web/lib/grading/grade-override.ts`) now consumes the shared factory instead of an inline ad-hoc store.
- `InMemoryGradeStore` remains in `@researchcrafters/evaluator-sdk` for unit tests; production callers (web reviewer overrides; worker grader once wired) now have a Prisma-backed alternative.

## Implementation summary

- `packages/db/src/grade-store.ts`
  - `findByKey(key)` parses `submissionId::rubricVersion::evaluatorVersion` and queries the compound unique index. Fails closed on malformed keys without hitting Prisma.
  - `insert(grade)` translates the SDK `Grade` into `prisma.grade.create`. Mirrors `status === "passed"` onto the `passed` boolean and flattens per-dimension `evidenceRefs` onto the row-level JSON column.
  - `appendOverride` keeps the transactional read-modify-write the reviewer route already depended on, and replays history when reading rows so `status` reflects the latest override (even when richer than the row's `passed` boolean can express).
  - Accepts an injected Prisma surface and `withQueryTimeout` for unit testing; defaults to the `@researchcrafters/db` singleton in production.
- `packages/db/src/index.ts` re-exports `makePrismaGradeStore`, `GradeNotFoundError`, `GradeStorePrisma`, and `MakePrismaGradeStoreOptions`.
- `packages/db/package.json` gains `@researchcrafters/evaluator-sdk` as a workspace dependency.
- `apps/web/lib/grading/grade-override.ts` drops its inline store and re-exports the shared factory + error class from `@researchcrafters/db`. `applyReviewerOverride` retains the prior-score telemetry snapshot.

## Commands run

Executed against `/Users/duyvt6663/github/ResearchCrafters-main` (an existing checkout with `node_modules` populated). The new worktree at `/Users/duyvt6663/github/ResearchCrafters-grade-persist` lacked `node_modules`; a fresh `pnpm install` timed out under the agent toolchain. Staged files were copied into the populated checkout for verification, then reverted.

- packages/db
  - `tsc --noEmit` — clean (no diagnostics).
  - `vitest run` — 22 tests / 1 skipped, 21 pass (crypto + grade-store).
  - `vitest run test/grade-store.test.ts` — 9 tests pass (findByKey, insert, appendOverride).
- apps/web
  - `vitest run lib/__tests__/route-grades-override.test.ts` — 10 tests pass (zod gate, reviewer auth, 404, telemetry, append-only history).
- packages/evaluator-sdk
  - `vitest run` — 143 tests pass (regression).

## Residual risks

- The Prisma `Grade` row does not carry `passThreshold` or `feedback` columns; `rowToSdkGrade` returns `passThreshold: 0` and `feedback: ""`. Worker callers that only round-trip for idempotency are unaffected; UI surfaces continue to read the threshold from rubric/stage metadata.
- `apps/worker` still does not wire a `GraderFn` in production; doing so requires Rubric/Stage YAML loading from `packages/content-sdk` and is tracked as a separate backlog item.
- Tests use a hand-rolled `GradeStorePrisma` mock surface rather than a live Postgres; the schema contract is re-asserted by the existing reviewer-route test fixtures.
