# QA — Fixture refresh cadence recorded in package metadata

**Date:** 2026-05-15
**Backlog item:** `backlog/02-erp-content-package.md:91` — "Decide a fixture
refresh cadence and record it in package metadata."
**Workflow ID:** 9955fc82-04ca-4880-b4eb-503d3f8be561

## What changed

1. `packages/erp-schema/src/schemas/package.ts`
   - Added `fixtureRefreshIntervalEnum`
     (`monthly | quarterly | semiannual | annual | on_trigger`),
     `fixtureRefreshTriggerEnum`
     (`library_upgrade | hardware_change | paper_revision | hash_drift | manual_audit`),
     `fixtureRefreshCadenceObjectSchema`, and a union acceptor
     `fixtureRefreshCadenceSchema` that takes either the legacy bare
     string form (`"annual"`) or a structured object and normalises both
     to `{ interval, triggers?, owner?, last_refreshed_at?, next_refresh_due? }`.
   - Wired the new field onto `packageSchema` as
     `fixture_refresh_cadence` (optional).
2. `packages/erp-schema/src/schemas/index.ts` — re-exported the new
   schemas/enums.
3. `content/packages/resnet/package.yaml` — promoted the bare
   `fixture_refresh_cadence: "annual"` to the structured form with
   triggers, owner (`content@researchcrafters`), `last_refreshed_at`
   (2026-05-07, the date `workspace/fixtures/stage-004/training_log.json`
   was last committed) and `next_refresh_due` (2027-05-07).
4. `content/templates/erp-basic/package.yaml` — same shape, with TODO
   owner and optional dates omitted so authors can fill them in after the
   first fixture acquisition run.
5. `content/packages/resnet/workspace/fixtures/README.md` — rewrote the
   "Refresh cadence" section to point at the structured metadata and
   describe each trigger.
6. `packages/erp-schema/test/schemas.test.ts` — added six tests covering
   the optional default, bare-string normalisation, full structured
   round-trip, unknown interval, unknown trigger, and non-ISO date.
7. `backlog/02-erp-content-package.md:91` — ticked.

The legacy `invalid-package` test fixture
(`packages/content-sdk/test/fixtures/invalid-package/package.yaml`) still
uses the bare string form intentionally — that fixture exists to assert a
*different* structural failure (`paper.title` missing) and the cadence
union accepts the bare string for exactly this kind of compatibility.

## Verification

- `pnpm test -- --run` in `packages/erp-schema`:
  47 / 47 tests pass (6 new in the new
  `package.fixture_refresh_cadence` describe block).
- `pnpm test -- --run` in `packages/content-sdk`:
  23 / 23 tests pass — confirms the resnet package and the leak-test
  / validator fixtures still load through `packageSchema.parse`.
- `pnpm build` in `packages/content-sdk` and `packages/cli`:
  type-check clean (no new errors).
- `node packages/cli/dist/index.js validate content/packages/resnet`:
  exit 0 — the structured cadence parses end-to-end through the CLI.

## Out of scope

- Pedagogy-layer escalation that would *require* a cadence on packages
  with replay-mode stages. The schema field stays optional for now,
  matching the existing pattern around `safetySchema`. A follow-up
  backlog bullet can land that escalation once authoring catches up.
- Drift detection / cron job that compares `next_refresh_due` against
  the wall clock and opens a backlog bullet when overdue. The metadata
  is now machine-readable, so that automation is unblocked but not in
  this change.
