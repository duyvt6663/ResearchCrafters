# QA: Reviewer-only grade override endpoint (2026-05-16)

## Scope

Backlog items addressed (`backlog/04-validation-evaluator.md` § Human Override):

- :111 — Add a reviewer-only endpoint to override a grade.
- :114 — Surface overrides to the learner with the reviewer note.
- :115 — Emit a telemetry event for every override.

## Changes

- `apps/web/lib/reviewer-access.ts` — new `isReviewer(userId)` helper backed
  by the `REVIEWER_USER_IDS` env allowlist (default-deny; case-sensitive;
  comma-separated, ignores empty entries).
- `apps/web/lib/grading/grade-override.ts` — new `applyReviewerOverride` +
  `makePrismaGradeStore`. `appendOverride` runs inside `prisma.$transaction`,
  filters malformed history entries, appends the SDK-built entry, and
  mirrors `override.status` → `passed` and `override.rubricScore` → `score`
  on the `Grade` row. `GradeNotFoundError` is raised when the row is gone.
- `apps/web/app/api/grades/[id]/override/route.ts` — new `POST` route.
  zod-validated `{ note, override }` body (strict, non-empty patch, score
  clamped to `[0, 1]`, status enum `passed|partial|failed`). Reviewer
  identity comes from `session.userId`; body cannot forge it. Telemetry
  emits `grade_overridden` with previous/next score after success.
- `apps/web/app/api/grades/[id]/route.ts` — GET route now reads
  `Grade.history` and returns a `grade.overrides` array shaped for the
  learner (`reviewerId`, `note`, `appliedAt`, `patch`). Malformed history
  entries are filtered; DB errors degrade to `overrides: []` so the rubric
  panel still renders.
- `apps/web/package.json` — added `@researchcrafters/evaluator-sdk` as a
  workspace dependency so the route can import `applyOverride` and the
  `GradeStore` type.
- `backlog/04-validation-evaluator.md` — checkboxes flipped with iteration
  notes for the three items.

## Tests added

- `apps/web/lib/__tests__/reviewer-access.test.ts` (6 cases) — default-deny,
  null/empty user ids, allowlist hits/misses, case sensitivity, empty
  string env, whitespace + empty entries.
- `apps/web/lib/__tests__/route-grades-override.test.ts` (9 cases) — zod
  bad-body, empty patch rejected, 401 unauthenticated, 403 reviewer-only
  (no row lookup leak, no telemetry), 404 missing grade, happy path
  (history append + scalar mirror + `grade_overridden` payload with
  previous/next score), session userId beats forged body, null
  `previousScore` preserved.
- `apps/web/lib/__tests__/route-grades-id.test.ts` (was 6, now 9) — added
  cases for surfacing reviewer overrides + notes, DB-error degradation to
  `overrides: []`, malformed history-entry filtering.

## Commands run

- `cd apps/web && pnpm vitest run lib/__tests__/reviewer-access.test.ts lib/__tests__/route-grades-override.test.ts lib/__tests__/route-grades-id.test.ts`
  → 24/24 pass.
- `cd apps/web && pnpm test`
  → 304 pass / 9 skipped (no regressions on the 304-test web suite).
- `cd apps/web && pnpm typecheck`
  → clean (no diagnostics).
- `cd apps/web && pnpm lint`
  → clean (`eslint . --max-warnings=0`).
- `cd packages/evaluator-sdk && pnpm test`
  → 88/88 pass (SDK unchanged; existing `applyOverride` contract still
  holds).
- `cd packages/evaluator-sdk && pnpm typecheck`
  → clean.

## Residual risks / follow-ups

- Reviewer authorization is env-driven (`REVIEWER_USER_IDS`). The right
  long-term answer is a `User.role` column + DB-backed role table; a
  follow-up backlog item should track the migration. Today's gate is a
  hard default-deny so the audit posture is conservative.
- The GET grade endpoint is still the historical stub for the rubric panel
  itself; only `overrides` is real. Wiring the full Grade lookup is tracked
  separately in backlog/06.
- The `Grade` Prisma row has no `feedback` column, so an `override.feedback`
  patch is preserved on the history entry only (the GET surface passes it
  through to the learner). When the Grade row gets a `feedback` column, the
  scalar mirror in `makePrismaGradeStore` should be extended.
