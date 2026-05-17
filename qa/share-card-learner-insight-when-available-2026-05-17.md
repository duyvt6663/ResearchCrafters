# QA — Share card: learner-written insight, when available

- **Date:** 2026-05-17
- **Backlog item:** `backlog/06-data-access-analytics.md:155` — _Include
  learner-written evidence-grounded insight when available._
- **Scope tested:** `POST /api/share-cards` body validation + payload
  shaping (`apps/web/lib/share-cards.ts` and the route at
  `apps/web/app/api/share-cards/route.ts`).

## Change summary

- `BuildShareCardPayloadInput.insight` is now optional (`string | null |
  undefined`). New helper `normalizeLearnerInsight` trims surrounding
  whitespace, suppresses blank/whitespace-only input (returns
  `undefined`), and clamps any present value to the new constant
  `SHARE_CARD_INSIGHT_MAX_LENGTH = 600`. `buildShareCardPayload` only
  writes `payload.learnerInsight` when normalization produced a value, so
  the immutable snapshot key is *absent* (not an empty string) on runs
  without a learner reflection.
- `POST /api/share-cards` body validation:
  - `insight` is no longer required; only `enrollmentId` is.
  - When the field is present but not a string, the route returns `400
    bad_request` with `reason: "invalid_insight"`.
  - Existing `invalid_json`, `missing_required_fields` (now triggered
    only by a missing `enrollmentId`), `invalid_branch_type`,
    `not_found`, `403`, and `401` paths are preserved.

The change is grounded in the surrounding share-card evidence — the
payload already carries `packageSlug`, `packageVersionId`,
`completionStatus`, `scoreSummary`, `hardestDecision`, and
`selectedBranchType`, so an insight written by the learner is anchored to
those concrete signals in the same immutable row.

## Commands run

```
cd apps/web && npx vitest run \
  lib/__tests__/share-cards.test.ts \
  lib/__tests__/route-share-cards.test.ts
# → Test Files 2 passed (2)  Tests 43 passed (43)

cd apps/web && npx vitest run \
  lib/__tests__/route-share-card-image.test.ts \
  lib/__tests__/route-public-share-page.test.tsx \
  lib/__tests__/api-smoke.test.ts \
  lib/__tests__/account-cascade.test.ts
# → Test Files 3 passed | 1 skipped (4)  Tests 20 passed | 9 skipped (29)
```

## Result

PASS — focused vitest suites green; downstream share-card surfaces
(`/s/[slug]`, share-card SVG, public-share-page route, account cascade)
unchanged and still passing. The OG metadata path in
`apps/web/app/s/[slug]/page.tsx:44` already guarded on
`payload.learnerInsight && length > 0`, so omitting the key is a
backwards-compatible shape change.

## Residual risks

- The 600-char cap is a guardrail, not a hard product constraint — if the
  learner-insight UI ever lets users author longer reflections we should
  surface the limit in the client.
- Persisted historical rows may still have empty-string `learnerInsight`
  values; readers must continue to treat both `undefined` and `""` as
  "no insight available" (the existing share surfaces already do).
- The route does not yet 413/422 on absurdly large request bodies; the
  library trim+slice prevents the snapshot from bloating, but the network
  cost of the request itself is not capped here.
