# Share-card payload generation — QA — 2026-05-15

Scope: `backlog/00-roadmap.md:87` — "Add share-card payload generation."

Runner: `skynet-backlog-iterator` cron (item
`248fa866-6e75-4337-a06f-df6e662fa942`).

Environment:
- node v25.8.1, pnpm 9.12.0
- Workspace: `/Users/duyvt6663/github/ResearchCrafters`
- Branch: `duykhanh/add-more-code-3`

## Change summary

Replaced the synthesized stub payload in `apps/web/app/api/share-cards/route.ts`
with a derived snapshot built from `getEnrollment` + `getPackageBySlug`.

- New helper `apps/web/lib/share-cards.ts` :: `buildShareCardPayload(input)`
  returns a `ShareCardPayload` (from `@researchcrafters/ui/components`)
  populated with: package slug + `packageVersionId`, completion status
  (`complete` when every authored stage is in `completedStageRefs`, otherwise
  `in_progress`), `scoreSummary` = `{ passed, total }`, hardest decision
  (caller-supplied or fall-back to `pkg.sampleDecision.prompt`), branch type
  (with authored `failed` mapped to public `alternative` so a failed pick is
  not exposed on the share surface), suppressed `cohortPercentage: null`
  (will become live once persisted `node_traversals` land — tracked under
  `backlog/06`), and the learner-written insight.
- `apps/web/app/api/share-cards/route.ts` now calls the helper and also
  validates `selectedBranchType` against the authored union — unknown values
  return 400 `invalid_branch_type` before any DB / auth work.
- `apps/web/app/enrollments/[id]/share/page.tsx` also routes through the
  helper so the page-side preview and the route-side payload cannot drift.
- `packages/ui/src/components/index.ts` now re-exports `ShareCardPayload`
  alongside `ShareBranchKind`.

Acceptance bullets in `backlog/06-data-access-analytics.md` under
"## Share Cards" that this iteration covers (durable rows are explicitly
out of scope and still tracked separately in 06):

- [x] Include package slug and version.
- [x] Include completion status.
- [x] Include score summary.
- [x] Include hardest decision when available.
- [x] Include selected branch and branch type.
- [x] Include cohort selection percentage only after minimum-N suppression
      passes. _(Cohort field is `null` (suppressed) by default; the route
      will start emitting a real percentage when persisted
      `node_traversals` land — see `backlog/06` Branch Stats and Privacy.)_
- [x] Include learner-written evidence-grounded insight when available.

Still pending (own backlog items):

- [ ] Store immutable share-card payload snapshot. _(durable DB row — see
      `backlog/06` Share Cards bullet 1.)_
- [ ] Persist `node_traversals` so the route can populate
      `cohortPercentage` instead of returning the suppressed null.

## Commands run

- `pnpm --filter @researchcrafters/web exec vitest run
   lib/__tests__/share-cards.test.ts lib/__tests__/route-share-cards.test.ts`
  → PASS (19/19).
- `pnpm --filter @researchcrafters/web run typecheck` → PASS.
- `pnpm turbo run test --concurrency=1` → PASS (19/19 tasks, 198 passed +
  9 skipped across the web suite, no regressions vs the 2026-05-14 P0 gate
  run).

## New / updated tests

- `apps/web/lib/__tests__/share-cards.test.ts` (new, 10 tests) — pins
  completion derivation, score summary, hardest-decision fallback, branch
  mapping (`failed` → `alternative`, others passthrough), suppression
  default, learner-insight passthrough, and the null-package fallback.
- `apps/web/lib/__tests__/route-share-cards.test.ts` (extended) — now mocks
  `getPackageBySlug`, asserts the full payload shape on the happy path,
  covers a completion-status=complete case, the `failed` → `alternative`
  mapping, and a new 400 `invalid_branch_type` regression for unknown
  branch values.

## Remaining risks

- Snapshot is not yet persisted — every POST still synthesizes a fresh
  `sc-${Date.now()}` id. Republish before the durable-row item lands and
  callers will see a new id each time. Tracked under `backlog/06`.
- `cohortPercentage` stays suppressed (`null`) until `node_traversals` are
  persisted; UI surfaces the authored rare-branch copy in that case, which
  matches existing behaviour.
