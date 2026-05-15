# P0 Integration-Quality Gate Run - 2026-05-14

Scope: Execute the P0 integration-quality gate defined in `backlog/10-integration-quality-gaps.md` (referenced from `backlog/00-roadmap.md:41`) and record current pass/fail evidence so remaining gaps can be re-queued.

Runner: `skynet-backlog-iterator` cron (item `3693c6e5-b033-4c70-a14d-bb246ec27d39`).

Environment:
- node v25.8.1, pnpm 9.12.0
- Workspace: `/Users/duyvt6663/github/ResearchCrafters`
- Branch: `duykhanh/add-more-code-3` @ `c72c60b`

## Commands run this iteration

- pnpm turbo run test --concurrency=1 -> PASS. 19/19 tasks successful (18 cached). Fresh task @researchcrafters/web#test: 178 passed + 9 skipped (187) across 26 files. No regressions vs 2026-05-08.
- validate content/packages/resnet --json -> PASS (ok=true, 0 errors, 0 warnings). Leak tests clean for S001-S008.
- validate content/templates/erp-basic --json -> PASS (ok=true, 0 errors, 0 warnings).


## Iteration 2 - Skynet backlog-iterator (item df68c9c8)

Date: 2026-05-14 (UTC), branch `duykhanh/add-more-code-3` @ c72c60b

### P0 section audit (this iteration, no code edits)

Counted every unchecked bullet under sections beginning with `## P0:` in
`backlog/10-integration-quality-gaps.md` (other open items live under P1
or under the diagnostic "Latest Verification" / "Current Verified
Failures" lists and are outside the P0 scope of this backlog item):

- `## P0: Browser Route Health` - 9/10 acceptance bullets checked. 1 open:
  - Line 114: "No console error appears on the happy-path catalog -> stage
    journey except explicitly allowed dev-only warnings."
    Inline note: routes healthy + Tailwind v4 fix landed; UI-polish sibling
    agent is in flight; visual/overflow Playwright assertions still pending.
- `## P0: Package Source of Truth` - 5/6 acceptance bullets checked. 1 open:
  - Line 139: "Deleting `apps/web/lib/data/*` does not remove the product loop."
    Inline note: helpers are now Prisma-backed query modules but still part
    of the loop. Confirmed 14 import sites in apps/web (4 server pages + 8
    API routes + 1 root page) plus 5 vitest mocks pointing at
    `@/lib/data/enrollment` / `@/lib/data/packages`. Relocation is a
    multi-file refactor, not a single-bullet fix.
- `## P0: ERP Schema and Content Contract` - all bullets checked. `validate`
  re-confirmed green for `content/packages/resnet` and
  `content/templates/erp-basic`.

### Recommendation

The umbrella backlog bullet "Complete all P0 tasks in
`10-integration-quality-gaps.md`" cannot be closed in a single iteration:

1. Browser console-error gate depends on the in-flight UI-polish agent and on
   running Playwright with browser console capture (currently a P1 quality
   gate item itself, line 267). Cannot be marked green from a non-UI cron.
2. `apps/web/lib/data/*` relocation is a real refactor across ~14 import
   sites and the matching test mocks; it should be its own backlog item with
   an explicit migration target (shared package vs. inline Prisma).

Recommend splitting the umbrella P0 item into two narrower backlog entries
and re-queuing them individually so a single cron iteration can plausibly
close each one. Failing this broad item back so refinement can happen.

