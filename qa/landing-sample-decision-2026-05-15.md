# QA: Package landing — sanitized sample decision node

Backlog item: `backlog/01-mvp-platform.md:86` ("Show a sanitized example of one
decision node and its branches.") under MVP Platform Backlog → Package
Landing Page.

## Status: validated — implementation already shipped

The marketing requirement is satisfied end-to-end by code already in `main`:

- **Seed → manifest** (`packages/db/src/seed.ts:146` `buildSampleDecision`):
  pulls the first decision-type stage and the branches whose graph nodes
  point at it. Failed branches are emitted with a redacted summary; the
  authored canonical mechanism never lands in `manifest.sampleDecision`.
- **Data layer** (`apps/web/lib/data/packages.ts:309` `redactSampleDecision`):
  defence-in-depth. On every read, failed branches have both `label` and
  `summary` replaced with non-spoiler placeholders ("Hidden until
  completion" / "(hidden — completed-stage lesson)") and `revealed` forced
  to `false`, so even a manifest with a leaky failed branch cannot escape
  through the catalog projection.
- **Page render** (`apps/web/app/packages/[slug]/page.tsx`):
  - Left column (line ~180): a "Sample decision" section renders
    `pkg.sampleDecision.prompt` and `pkg.sampleDecision.branches` through
    `DecisionChoiceList` in `readOnly` mode. The page explicitly forces
    `revealed: b.revealed && b.type !== "failed"` so failed branches show as
    locked placeholders even if the data layer redaction is bypassed.
  - Right rail (line ~290): the same branches drive a `DecisionGraphMobile`
    preview, again gating `summary` on `b.revealed` so failed branches stay
    blank.

## Verification

- `pnpm --filter @researchcrafters/web exec vitest run
  lib/__tests__/data/packages.test.ts` → 6 tests pass. Includes:
  - `projects manifest fields onto the package detail shape and redacts
    failed-branch summaries` — asserts the canonical/suboptimal branches
    surface as authored and the failed branch is `revealed: false`, with
    no "BatchNorm" / "optimizer" leak from the canonical mechanism.
- No new code change required for this iteration. The backlog checkbox is
  the only change.

## Spoiler boundary (recap)

The catalog is the marketing surface, so the failed-branch CHOICE itself is
treated as a spoiler. Both `label` and `summary` are scrubbed before any
public render. Canonical and suboptimal branches surface as authored — they
are the answers the catalog wants to advertise.

## Files touched

- `backlog/01-mvp-platform.md` — tick the landing-page sample-decision box.
- `qa/landing-sample-decision-2026-05-15.md` — this report.
