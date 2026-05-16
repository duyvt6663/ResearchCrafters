# QA — Surface low-confidence or policy-violating mentor outputs for review

Date: 2026-05-16
Backlog item: `backlog/05-mentor-safety.md:51` — Mentor Safety > Mentor
Interaction > _Surface low-confidence or policy-violating outputs for review._
Skynet workflow id: `3e9fb636-fc1e-4d41-8f2b-05f084cd4b04`

## Scope tested

- `apps/web/lib/mentor-runtime.ts`
  - New exported heuristic `detectLowConfidence(text, finishReason)` returns
    `"low_confidence:empty" | "low_confidence:truncated" |
    "low_confidence:uncertainty" | null`.
  - `runMentorRequest` now sets `flagged=true` and a `flagReason` on the
    persisted `MentorMessage` for:
    1. Leak-test failure (existing behaviour) — `flagReason="policy_violation"`.
    2. Low-confidence response — `flagReason` carries the sub-reason tag.
  - One audit-grade telemetry event
    `mentor_output_flagged_for_review` is emitted per flagged assistant
    message, carrying `{ enrollmentId, stageRef, reason, modelTier, modelId }`.
- `packages/telemetry/src/events.ts`
  - New `MentorOutputFlaggedForReviewEvent` added to the discriminated union
    and to `AUDIT_GRADE_EVENTS` so the event is dual-written to Postgres for
    indefinite retention (consistent with `evaluator_redaction_triggered`).
- `apps/web/lib/telemetry.ts` — name added to web-side
  `TelemetryEvent` union so the `track()` shim accepts the new event.
- `packages/telemetry/test/track.test.ts` — `AUDIT_GRADE_EVENTS` taxonomy
  assertion updated.

Low-confidence heuristics (conservative, false positives only increase
queue volume; they never refuse the learner):

- Empty / very short response (< 16 chars after trim).
- Truncated finish reason (`max_tokens` / `length`).
- Substring match against an explicit uncertainty marker list
  (`i don't know`, `i'm not sure`, `i cannot determine`, ...).

Schema-level changes: **none**. The existing `MentorMessage.flagged` boolean
+ `@@index([flagged])` already supports a "give me open items" query. The
`flagReason` is currently returned on the runtime outcome and emitted in
telemetry; persisting it as a dedicated column is a follow-up tracked under
§Review Queue along with "Track resolution status".

## Commands

```
cd packages/telemetry && pnpm typecheck
cd packages/telemetry && pnpm test
cd packages/ai && pnpm typecheck
cd apps/web && pnpm vitest run lib/__tests__/mentor-runtime.test.ts
cd apps/web && pnpm vitest run lib/__tests__/route-mentor-messages.test.ts
```

All passed.

- `packages/telemetry` test: `7 passed (7)` — including the updated
  `AUDIT_GRADE_EVENTS` assertion.
- `apps/web` mentor-runtime test: `14 passed (14)` — 4 new tests
  (low-confidence: empty, uncertainty, truncated; healthy = unflagged) plus a
  pure unit suite over `detectLowConfidence`.
- `apps/web` route-mentor-messages test: `10 passed (10)` — regression check
  on the route; unchanged behaviour.

## Pre-existing typecheck noise (NOT introduced by this change)

`apps/web` `pnpm typecheck` surfaces two unrelated pre-existing errors that
are present on this branch without any of my edits (confirmed via
`git stash && pnpm typecheck`):

- `lib/__tests__/data/enrollment.test.ts:217:33` — `EvidenceItem.verified`
  not on type.
- `lib/data/enrollment.ts:125:7` — same property.

These belong to other in-progress backlog items in the dirty worktree
(`evidence-verified` / grade-store WIP). Out of scope.

## Open follow-ups (handed back to backlog)

- `MentorMessage.flagReason` column + Prisma migration — reviewers need a
  persistent reason field, not just telemetry payloads. Belongs alongside
  "Track resolution status" in the Review Queue section of
  `backlog/05-mentor-safety.md`.
- Review queue UI + package-author / platform-reviewer visibility (still
  pending, lines 82–84 of `backlog/05-mentor-safety.md`).
- Tune `LOW_CONFIDENCE_MIN_CHARS` and the uncertainty marker list from real
  queue triage data once a reviewer surface exists.

## Result

PASS — the mentor runtime now surfaces both policy-violating and
low-confidence assistant outputs for review via the existing `flagged`
column index and a new audit-grade `mentor_output_flagged_for_review`
telemetry event carrying the reason tag. Implementation, tests, and
backlog markdown all updated; QA report ready for the QA queue.
