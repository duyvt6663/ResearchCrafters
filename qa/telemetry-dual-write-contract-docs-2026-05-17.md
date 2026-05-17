# QA: Telemetry dual-write contract & retention docs

**Date:** 2026-05-17
**Backlog refs:**
- `backlog/06-data-access-analytics.md:119` — PostHog as primary analytics store
- `backlog/06-data-access-analytics.md:121` — Postgres audit-grade copy
- `backlog/06-data-access-analytics.md:123` — Define audit-grade events
- `backlog/06-data-access-analytics.md:126` — Define retention
- `backlog/06-data-access-analytics.md:129` — Document dual-write contract

**Workflow items:**
- `5fca0ee9-08f2-4d92-9aef-58cf9e143089` (primary)
- `bfc2a455-ceca-495f-b754-84e05d4b208d`
- `06947840-de56-4a7b-9545-b218cda248ca`
- `3f490d1a-8ded-4a7d-9415-5e1f074609b0`
- `122eeb76-7f2e-4cfb-8811-0a28068d8409`

## Scope

The five claimed bullets are the **Events Storage** section of
`backlog/06-data-access-analytics.md`. The unrelated **Migration UX**
bullet on line 134 was deliberately left unclaimed.

## What changed

The PostHog → Postgres dual-write was already implemented in
`packages/telemetry/src/{init,track,events}.ts` during the
2026-05-15 telemetry-track-wired iteration (see
`qa/telemetry-track-wired-2026-05-15.md`). What was missing was the
formal written contract that closes out the Events Storage bullets.

Added a new subsection **Events storage and dual-write contract** under
the existing Telemetry taxonomy in `docs/TECHNICAL.md` that pins:

- PostHog as the primary product analytics store (env vars, lazy client,
  no-op when unset).
- The closed `AUDIT_GRADE_EVENTS` list with rationale ("affect
  entitlement, grading, mentor policy, payments, or moderation") and the
  rule for promoting new event types.
- A "which store to query for which question" table mapping common
  questions (funnels, grade audit, redaction reasons, mentor flags,
  subscription start, branch feedback unlock, generic counts) to the
  correct store.
- Retention: PostHog 13 months; Postgres audit-grade indefinite;
  Postgres non-audit scrubbed to anonymized aggregates after 24 months —
  with the note that the scrubbing job is a no-op today because only
  audit-grade rows are written.
- Best-effort semantics: both writes are `try/catch` so a telemetry
  outage never blocks the request that emitted the event.

Updated `backlog/06-data-access-analytics.md` to check off the five
Events Storage bullets with the implementing file references next to
each box (matches the pattern used for the existing checked Telemetry
bullets above).

## Why this is safe

- Documentation-only change plus backlog checkbox updates. No code
  paths, schemas, or runtime behavior changed.
- Source-of-truth claims in the new section were verified against the
  current code:
  - PostHog client wiring: `packages/telemetry/src/init.ts`
    `getPostHogClient` reads `POSTHOG_API_KEY`/`POSTHOG_HOST`, lazily
    imports `posthog-node`, returns `null` when key is unset.
  - Dual-write gating: `packages/telemetry/src/track.ts` `track()` calls
    `ph.capture(...)` then conditionally `store.event.create(...)`
    behind `isAuditGradeEvent(name)`.
  - Audit-grade list: `packages/telemetry/src/events.ts`
    `AUDIT_GRADE_EVENTS` exports exactly the six names documented.
- Retention claims for non-audit rows describe a target policy; the
  doc explicitly flags that the scrubbing worker is a no-op today
  because non-audit rows are not written. Adding the worker is a
  separate backlog item (will be filed if/when non-audit Postgres
  writes are added).

## Verification

- Visual inspection of `docs/TECHNICAL.md` diff — new subsection sits
  between the Telemetry taxonomy and §6 Repo Structure.
- `rg "AUDIT_GRADE_EVENTS" packages/telemetry/src` confirms the closed
  list and its members match the doc.
- `rg "POSTHOG_API_KEY|POSTHOG_HOST" packages/telemetry/src` confirms
  the env-var contract documented.
- No code edits → no test runs needed for this change. The underlying
  dual-write behavior was previously verified by
  `packages/telemetry/test/track.test.ts` and
  `apps/web/lib/__tests__/telemetry.test.ts` (see prior QA report).

## Out of scope

- Migration UX bullet (`backlog/06-data-access-analytics.md:134`) —
  separate concern, left unclaimed.
- Building the Postgres scrub-after-24-months worker — currently a
  no-op because only audit-grade rows are written; will be filed as
  a fresh backlog item when non-audit Postgres writes are introduced.
- Backfilling the Postgres copy from PostHog export — operator concern,
  not a backlog item.
