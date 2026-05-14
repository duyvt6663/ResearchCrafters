# Progress Sync v2 Report

Date: 2026-05-08 (post Tier-1 API hygiene + Tailwind v4 migration)
Author: progress-sync-2 agent

## TL;DR

Walked PROGRESS.md and the eleven workstream files after the orchestrator
landed two batches of work in parallel: (a) Tier-1 API hygiene — `await`
fixes on `/api/packages` and `/api/enrollments/:id/graph`, ten routes
moved from cookie-only `getSession()` to Bearer-aware
`getSessionFromRequest`, and structured-400 body guards on
`/api/stage-attempts`, `/api/share-cards`, `/api/node-traversals`; and
(b) the Tailwind v4 migration in `apps/web` (`globals.css` rewritten to
`@import "tailwindcss"` + `@source "../../../packages/ui/src/**/*.{ts,tsx}"`,
dead `tailwind.config.ts` removed). Verified each fix in source before
flipping checkboxes. Also annotated four sibling agents (UI polish, schema
completeness, runner-loop, CLI/entitlements) as `_(in flight)_` against
items they are still touching, and added the residual gaps from the QA
reports (no API route handler tests, untested CLI submit deny-list, mock-only
`AnthropicGateway`, the Next 15.5.16 dev cache flake) into PROGRESS's "Open
today" and `10-integration-quality-gaps.md`.

## Per-file edit count

- `backlog/PROGRESS.md` — major prose rewrite. Banner moved to "post Tier-1
  API hygiene + Tailwind v4 migration"; "Status today" rewritten to
  reflect the await fixes, Bearer auth on 10 routes, body-validation
  guards on 3 routes, and the Tailwind v4 migration; "Closed since the
  prior review" gained 4 new bullets crediting the just-landed Tier-1
  work; "Stabilization pointer" rewritten with `_(in flight)_` markers
  on 4 sibling-agent workstreams; "Open today" rebuilt against the QA
  reports (10 new gap bullets including the runner-callback auth gap,
  no API handler tests, untested CLI submit deny-list, mock-only
  Anthropic, Next dev cache flake, ResNet `math` node, S004 redaction
  brittleness, encryption-at-rest, OTel SDK, wireframes, perf budget,
  branch reveal, second package); "01 — MVP Platform" Built/Stubbed/Gaps
  reflects 5 new Built bullets + 1 in-flight stub + 2 in-flight gap
  bullets; "Suggested next moves" rewritten 1→10.
- `backlog/00-roadmap.md` — 0 checkbox flips. 2 prose annotations on
  Phase 3 share-card and branch-stats lines (in-flight markers).
- `backlog/01-mvp-platform.md` — **2 [ ]→[x]** flips (`/api/packages`
  await, `/api/enrollments/:id/graph` await), **1 [ ]→[x]** flip
  (Tailwind package-source scanning), **2 [x] gain Tier-1 fix
  citations**, **2 new `_(in flight)_` items added** (UI polish;
  CLI/entitlements polish).
- `backlog/02-erp-content-package.md` — 0 checkbox flips. 1 in-flight
  annotation on `safety.redaction_targets`. 2 new gap items added in
  "Open gaps from snapshot" (math node, S004 redaction lengthen).
- `backlog/03-cli-runner.md` — 0 checkbox flips. 4 `_(in flight)_`
  annotations on runner-loop and CLI/entitlements items.
- `backlog/04-validation-evaluator.md` — 0 checkbox flips. 1 in-flight
  annotation on `safety.redaction_targets`, 1 in-flight annotation on
  trace tree validation, 4 new gap items added in "Open gaps from
  snapshot" (`safetySchema`, `must_not_contain` capture, default-battery
  union, dropped stage-fields surfacing) — all marked `_(in flight)_`.
- `backlog/05-mentor-safety.md` — 0 checkbox flips. 2 in-flight
  annotations on the leak-test default battery and on
  `safety.redaction_targets`.
- `backlog/06-data-access-analytics.md` — **2 [ ]→[x]** flips
  (`/api/packages` await, `/api/enrollments/:id/graph` await). 2
  in-flight annotations on persisted traversals and branch-stats
  rollup.
- `backlog/07-alpha-launch.md` — 0 edits. The QA reports do not surface
  any new alpha-launch deltas.
- `backlog/08-infra-foundations.md` — 0 checkbox flips. 1 in-flight
  annotation on Redis port collision.
- `backlog/09-frontend-design.md` — Decision Graph note rewritten to
  remove the "graph returns `{}`" claim now that the await fix
  landed; mobile/text-fits item annotated with the Tier-1 Tailwind
  fix; 1 new `_(in flight)_` UI-polish gap added.
- `backlog/10-integration-quality-gaps.md` — banner already on
  2026-05-08; rewrote the Status header to reflect Tier-1 closures.
  **3 [ ]→[x]** flips in "Current Verified Failures"
  (`/api/packages`, `/api/enrollments/:id/graph`, Tailwind utility
  emission). 6 in-flight annotations on the residual rows
  (CLI runId, BullMQ enqueue, runner-callback auth, EnrollResponse
  starter URL, branch traversal persistence, Redis port). 3 new
  failure rows added (no API route handler tests, untested CLI submit
  deny-list, mock-only `AnthropicGateway`).
- `qa/progress-sync-2-report.md` — NEW (this file).

## Top 3 truth-vs-doc deltas

1. **Tier-1 API hygiene flipped four lines that QA agents flagged as
   HIGH-severity blockers.** `/api/packages` and `/api/enrollments/:id/graph`
   were both serializing unresolved promises, so the catalog and graph
   endpoints returned `{}` to every consumer (CLI, future graph view,
   admin tools). 10 routes were silently dropping CLI Bearer tokens to
   anonymous via cookie-only `getSession()`. Three routes were 5xx-ing
   on empty bodies. All four classes are now closed in source — verified
   by reading `apps/web/app/api/packages/route.ts`,
   `apps/web/app/api/enrollments/[id]/graph/route.ts`, and grepping
   `getSessionFromRequest` across the 10 named routes. PROGRESS.md
   "Status today" had described these as the dominant defects; the
   doc now matches the code.

2. **The "bland UI" symptom in the FE QA report was a Tailwind v4
   migration gap, not a layout-design gap.** `apps/web/app/globals.css`
   was using v3 directives (`@tailwind base/components/utilities`) plus
   a v3 `tailwind.config.ts` that v4 was completely ignoring, so the
   utility classes from `packages/ui` (e.g. `flex-col` on the AppShell)
   were never emitted into the bundle. The Tier-1 fix migrates to
   `@import "tailwindcss"` + an explicit `@source` for the workspace
   package and removes the dead config, taking the CSS payload from
   109 lines to ~1328 with utility classes resolved. PROGRESS,
   `01-mvp-platform.md`, `09-frontend-design.md`, and
   `10-integration-quality-gaps.md` all carried the "horizontal overflow
   because Tailwind isn't emitting all classes" symptom — those are
   now flipped or annotated; sibling UI polish work continues on
   residual layout regressions.

3. **The four sibling-agent workstreams overlap several already-listed
   "open" items and would otherwise look like sync rot if not
   annotated.** UI polish is rewriting catalog/overview/stage layouts +
   AppShell + dark-mode toggle (overlaps `01` UX polish and `09` open
   gaps). Schema-completeness is touching `package.safety.redaction_targets`,
   `mentor_leak_tests[*].must_not_contain`, the default-vs-authored
   leak-test battery composition, and dropped stage fields (overlaps
   `02`, `04`, and `05`). Runner-loop is wiring BullMQ `submission_run`
   from finalize, the worker, callback persistence with service-token
   auth (overlaps `03`, `06`, `08`, `10`). CLI/entitlements is wiring
   `lastRunId`, fixing the `slug@slug@stub` rendering bug, dropping
   dead `EnrollResponse` fields, and replacing the `/api/entitlements`
   stub with live Prisma reads (overlaps `01`, `03`, `06`, `10`).
   Without `_(in flight)_` annotations, the next progress-sync would
   either re-flip these as gaps or claim them as Built before the
   sibling agents land. Annotated 14 line-items across 7 files.
