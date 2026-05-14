# Doc Sync v3 Report

Date: 2026-05-08
Scope: Walk every backlog workstream file + PROGRESS.md against live code
after autonomous-loop iterations 1-10. Flip checkboxes, refresh prose,
annotate in-flight work.

## TL;DR

Iterations 1-10 closed substantially more ground than the per-workstream
files reflected. The biggest deltas are: (1) **schema completeness**
(`package.safety.redaction_targets`, `must_not_contain`, union battery,
6 surfaced dropped fields) is fully landed but backlog 04/05 still showed
it as "schema-completeness agent in flight"; (2) **OpenTelemetry SDK**
shipped in `apps/web` (iteration 10) but the open-today section still
claimed it was uninstalled; (3) **mobile decision-graph fallback**
(`DecisionGraphMobile`) shipped in iterations 4+5 with full wiring +
tests but backlog 09 still listed it as `- [ ]`. PROGRESS.md was rewritten
to credit iterations 1-10 in a "Closed since prior review" section,
"Open today" was rebuilt with `_(in flight)_` annotations for sibling
agents extending OTel to worker/runner, wiring encryption-at-rest, and
adding the Lighthouse CI step.

`pnpm test` confirmed: **378 passing + 9 skipped across 18 tasks**
(was 372+9 before iteration 10's `tracing.test.ts` 6-case suite). The
372 → 378 delta matches a clean +6 web tests.

## Per-file edit count

| File                                      | Edits |
|-------------------------------------------|-------|
| backlog/PROGRESS.md                         | 4 (header, status counts, closed-section rewrite, open-today rewrite) |
| backlog/00-roadmap.md                       | 1 (S001M annotation) |
| backlog/01-mvp-platform.md                  | 1 (mobile decision-graph fallback) |
| backlog/02-erp-content-package.md           | 2 (safety.redaction_targets, S004 redaction phrases) |
| backlog/03-cli-runner.md                    | 2 (lastRunId persisted, drop dead bullet on combined task) |
| backlog/04-validation-evaluator.md          | 5 (safety schema validation, must_not_contain, union battery, dropped-field surfacing, schema-completeness summary) |
| backlog/05-mentor-safety.md                 | 2 (battery union composition, package safety.redaction_targets) |
| backlog/06-data-access-analytics.md         | 1 (failed-branch label redaction) |
| backlog/08-infra-foundations.md             | 3 (OpenTelemetry partial landing, OTel open-gap update, encryption-at-rest in flight) |
| backlog/09-frontend-design.md               | 3 (mobile fallback flipped, mobile sheet/tab note, open-gap reword) |
| backlog/10-integration-quality-gaps.md      | 5 (status banner rewrite, callback service auth flipped, callback persistence narrowed, CLI lastRunId flipped, route-handler/CLI-bundle-policy flipped to closed) |
| backlog/11-learning-modules-math-writing.md | 1 (status banner inserted) |
| qa/doc-sync-3-report.md             | NEW |

Total: 30 edits across 12 files + 1 new self-report.

## 3 most important truth-vs-doc deltas

1. **Schema completeness is fully landed (was marked in-flight).**
   `packages/erp-schema/src/schemas/package.ts` declares
   `safety.redaction_targets` (lines 73-99);
   `packages/erp-schema/src/schemas/stage.ts` declares
   `must_not_contain` (line 105) and surfaces 6 previously dropped
   stage fields; `packages/content-sdk/src/validator/leak-tests.ts`
   composes the battery as `[...DEFAULT_ATTACKS, ...authored]` with
   id-dedupe (lines 127, 139, 176-181). backlog 04 had four open
   schema-completeness checkboxes that should have been checked;
   backlog 02 / backlog 05 referenced "schema-completeness agent in flight"
   in 5 places. All flipped.

2. **OpenTelemetry SDK is wired in apps/web (was marked uninstalled).**
   `apps/web/instrumentation.ts` calls `@vercel/otel`;
   `apps/web/lib/tracing.ts` exposes `withSpan` and
   `setActiveSpanAttributes` with a transparent test path;
   `apps/web/lib/__tests__/tracing.test.ts` adds 6 tests (which is
   exactly the 372 → 378 web delta). PROGRESS.md "Open today"
   previously said "still not installed in web/worker/runner"; now
   reads "still pending in worker/runner" with `_(in flight)_` for
   the sibling agent extending the same pattern.

3. **Mobile DecisionGraphMobile fully wired (was marked skeleton-only).**
   `packages/ui/src/components/DecisionGraphMobile.tsx` exists;
   `apps/web/app/packages/[slug]/page.tsx` imports and renders it
   (line 8, 132); `packages/ui/test/decision-graph-mobile.test.tsx`
   pins behavior with 5 tests (the entirety of the UI workspace's
   5 incremental tests over the prior 14). backlog 09 had it open;
   backlog 01 didn't mention it at all. Both updated. The
   stage-player code/experiment mobile sheet UI remains genuinely
   open and is now called out distinctly.

## Other notable closures

- **Failed-branch label redaction** at the catalog spoiler boundary:
  `apps/web/lib/data/packages.ts` `redactSampleDecision` strips
  canonical-branch labels; `packages/db/src/seed.ts`
  `buildFailedBranchLesson` writes a non-spoiler title. backlog 06 now
  credits this.
- **Runner callback `X-Runner-Secret`** constant-time service-token
  gate landed (`apps/web/app/api/runs/[id]/callback/route.ts:14, 61,
  120`), pinned by `route-runs-callback.test.ts` (7 cases). Run
  persistence after auth passes is still in flight. backlog 10 was
  flipped on the auth half, narrowed on the persistence half.
- **CLI `lastRunId` persistence + `slug@slug@stub` rendering fix**
  landed (`packages/cli/src/commands/submit.ts:119`,
  `packages/cli/src/lib/config.ts:94`,
  `packages/cli/src/commands/status.ts:56-97`), pinned by
  `packages/cli/test/status-render.test.ts`. backlog 03 / backlog 10
  flipped accordingly.
- **S004 redaction targets**: 11 contextualized phrases now in
  `content/packages/resnet/curriculum/stages/004-cifar10-replay.yaml`
  (lines 71-86); bare `"0.03"` is gone. backlog 02 flipped.

## Ambiguous / left annotated but not flipped

- **`docker isolation`, BullMQ enqueue, run persistence, evaluator
  invocation** in backlog 03 / backlog 10 stay open because the live code
  shows finalize still creates only a queued `Run` row (verified in
  PROGRESS.md prose, not changed by iterations 1-10). Annotated
  `_(runner-loop agent in flight)_` where applicable.
- **`/api/entitlements` legacy `u-paid` filter** stays open
  (`_(in flight)_` for the CLI/entitlements agent) because no commit
  in iterations 1-10 touched the entitlements query.
- **UI polish for catalog/overview/stage layouts** stays
  `_(in flight)_` — Tailwind v4 utility generation is fixed but
  layout regressions are described as the responsibility of a
  sibling agent in the original instructions; no completion signal
  in source to flip.
- **Email magic-link / Anthropic real provider** remain explicit
  defers (no API key, no email-service workstream).

## Verification commands run

- `git log --oneline -20`
- `pnpm test` (full workspace) — confirmed 378+9 across 18 tasks
- File spot-checks on `apps/web/instrumentation.ts`,
  `apps/web/lib/tracing.ts`, `packages/erp-schema/src/schemas/{package,stage}.ts`,
  `packages/content-sdk/src/validator/leak-tests.ts`,
  `content/packages/resnet/curriculum/stages/004-cifar10-replay.yaml`,
  `apps/web/lib/data/packages.ts`, `packages/db/src/seed.ts`,
  `packages/ui/src/components/DecisionGraphMobile.tsx`,
  `apps/web/app/packages/[slug]/page.tsx`,
  `packages/cli/src/commands/{submit,status}.ts`,
  `packages/cli/src/lib/config.ts`,
  `apps/web/app/api/runs/[id]/callback/route.ts`,
  `packages/cli/test/{submit-bundle,status-render}.test.ts`,
  `apps/web/lib/__tests__/route-*.test.ts` directory listing
  (9 route-handler test files confirmed).
