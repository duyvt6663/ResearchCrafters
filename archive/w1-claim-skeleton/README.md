# W1 — Claim Skeleton

> **Module:** writing
> **Status:** archived
> **Owner:** _unassigned_
> **Created:** 2026-05-14
> **Promoted:** 2026-05-14
> **Archived:** 2026-05-14

## Goal

Make the writing rubric *visible inside the editor*. Today, stage S006
("Write a precise claim about residual learning") shows the learner a single
free-text editor (`WritingWorkbench` → `RichAnswerEditor`,
`packages/ui/src/components/WritingWorkbench.tsx:122`) and a rubric panel in
a separate right column. A learner who is staring at the blank editor has to
context-switch to read the rubric, then context-switch back to write — and
the rubric's four criteria (mechanism, conditions, evidence, scope)
typically end up scattered or partly missing in first drafts.

## Hypothesis

Learners who use a skeleton with one card per rubric criterion will produce
first drafts that address all four criteria at least 70% of the time, vs.
≤40% in the current single-textarea baseline. They will also be more likely
to attach at least one evidence reference (`[ref:<id>]`) to the *evidence*
criterion specifically, instead of attaching it to whichever sentence they
happened to be writing when they remembered.

## In scope

- Four reorderable cards, one per rubric dimension (Mechanism · Conditions ·
  Evidence · Scope), each with its own placeholder prompt and textarea.
- Up/down reorder controls on each card (DnD is out of scope for the mock —
  keyboard-friendly buttons are enough to test the concept).
- Stubbed evidence panel — clicking "Insert ref" on an item appends
  `[ref:<id>]` into the *Evidence* card's text (matches the production
  `[ref:<id>]` token contract in
  `packages/ui/src/components/WritingWorkbench.tsx:70`).
- Live "Assembled draft" preview that joins the cards in their current
  order with paragraph breaks. This is what would be submitted.
- Word-budget meter showing `min_words: 40` and `max_words: 160` from
  `001-..., 006-claim-writing.yaml` as visible tick marks.
- Rubric "presence chips" — light up when their dimension has any
  text (a fixed-keyword heuristic for the mock; not real grading).
- "Show target" reveal of the canonical claim from
  `006-claim-writing.yaml` for reviewer comparison.

## Out of scope

- True drag-and-drop reordering (production version uses `dnd-kit`).
- Real grading — the presence chips check only `text.length > 0` for the
  mock, not whether the text actually addresses the criterion.
- Inline `[ref:<id>]` token rendering as styled chips inside the editor
  body (that's a separate proposal, W2).
- Mentor-panel interaction.
- "Merge to prose" mode that collapses the four cards into a single editor
  for polish — the cards alone are enough to test the structuring effect.
- Citation provenance popover (deferred to W2).
- Per-stage configuration of which dimensions to show (today the four
  dimensions are hardcoded to S006's rubric).

## How to view

```bash
pnpm --filter @researchcrafters/web dev
# open http://localhost:3000/experiments/w1-claim-skeleton
```

## Manual test script

Happy path (a learner producing a first draft that hits all four criteria):

1. Open the experiment URL.
2. Read the stage prompt at the top — quoted verbatim from
   `006-claim-writing.yaml`.
3. **Mechanism** card: type something like _"Residual learning re-parameterises
   each block to learn F(x) + x with a parameter-free identity shortcut."_
4. **Conditions** card: _"Training a deep CNN on CIFAR-10 with SGD + momentum
   and BatchNorm, at depths 20–56 layers."_
5. **Evidence** card: click "Insert ref" on the *plain-vs-residual* evidence
   item. A `[ref:plain-vs-residual]` token appears in the card's text.
   Continue: _"training error decreases with depth, where plain nets'
   training error increases with depth."_
6. **Scope** card: _"Does not apply to very shallow nets where the
   degradation does not manifest."_
7. Scroll to "Assembled draft". Confirm the four parts joined cleanly into
   one paragraph-broken claim. Word-budget bar should sit between 40 and
   160 (green region).
8. Click "Show target". Compare your assembly to the canonical claim from
   `006-claim-writing.yaml`.

Reorder + delete flow:

9. Click the up arrow on the *Evidence* card so it sits above *Conditions*.
   Confirm the assembled draft re-orders accordingly.
10. Clear the *Scope* card. Confirm its rubric presence chip dims.

Word-budget flow:

11. Type a single short word into one card. Confirm the meter shows the
    under-min warning state.
12. Paste a long Lorem ipsum into one card until total >160. Confirm the
    over-max warning state.

## Validation criteria

- **Success looks like:** a reviewer who has never seen S006 writes a draft
  that addresses all four criteria in their first attempt; the assembled
  draft reads as natural prose (not stilted "card 1, card 2" output); the
  presence chips correctly reflect which cards are filled.
- **Failure looks like:** the assembled prose feels chopped or robotic;
  reviewers ignore the card boundaries and just type the whole claim into
  the first card; the four labels mean nothing to a reviewer who hasn't
  studied the rubric.
- **Inconclusive:** reviewers complete the task but report wanting both
  a skeleton mode AND a free-prose mode — signal we need a toggle, not a
  replacement.

## Findings

Append-only.

- **2026-05-14 — repo-owner — promoted to packages/ui.** Mock validated the
  four-card structuring effect and the in-editor rubric coverage chips.
  Shipped as `ClaimSkeleton` (`packages/ui/src/components/ClaimSkeleton.tsx`)
  with an opt-in `skeleton` prop on `WritingWorkbench`.
- **2026-05-14 — repo-owner — archived (Phase 2 wired end-to-end).** Authoring
  added to the stage YAML schema (`stageInputsSkeletonSchema` in
  `packages/erp-schema/src/schemas/stage.ts`); `006-claim-writing.yaml`
  authors a 4-dimension skeleton (mechanism · conditions · evidence · scope)
  bound to the existing rubric; the data layer surfaces it on
  `StageRecord.skeleton`; the stage page routes writing-stages with skeleton
  through `WritingStageView`
  (`apps/web/app/enrollments/[id]/stages/[stageRef]/views/WritingStageView.tsx`),
  which renders `WritingWorkbench` with the `skeleton` prop and POSTs the
  assembled draft to `/api/stage-attempts`. Writing stages without a skeleton
  authored still fall through to `RichAnswerEditor` (non-breaking). Mock
  removed from the experiments registry.

## Decision

`archive` — integrated end-to-end 2026-05-14.

Open follow-ups (intentionally deferred so each can be reviewed independently):

- Per-stage skeleton authoring in the curriculum YAML
  (`task.inputs.mode: skeleton` + `task.inputs.skeleton.dimensions`) and
  matching `@researchcrafters/content-sdk` schema. Currently `SkeletonSpec`
  is constructed in TypeScript by the consumer.
- True drag-and-drop reordering via `dnd-kit`. Keyboard ↑/↓ buttons stay
  as the a11y fallback either way.
- Persisted per-card state — today rehydration splits the persisted draft
  by `joiner`, so a learner who returns mid-draft sees their content but
  not necessarily in the original cards.
- Pairs with W2 (citation chips) and W3 (real rubric heuristics, not just
  has-any-text presence). The presence chips here ship as a length-only
  heuristic; W3 will upgrade to keyword/LLM signals.

## Integration sketch

_Filled in if promoted. Likely landing zone:_

- Extend `WritingWorkbench` (`packages/ui/src/components/WritingWorkbench.tsx`)
  with an optional `skeleton: SkeletonSpec` prop. When provided, swap the
  central `RichAnswerEditor` for a `<ClaimSkeleton>` component whose final
  submitted value is the assembled prose joined from the cards.
- The submitted artifact is still a single string — the `draft.value` /
  `draft.onChange` contract on `WritingWorkbench` does not change, so
  validation and rubric grading remain untouched.
- Author the skeleton per stage in the curriculum YAML — e.g. a new
  `task.input.skeleton` block in `006-claim-writing.yaml` listing the
  rubric dimensions to expose, ordered, with per-dimension placeholders:

  ```yaml
  task:
    inputs:
      mode: skeleton
      skeleton:
        dimensions:
          - id: mechanism
            label: "Mechanism"
            placeholder: "State what residual learning does."
          - id: conditions
            label: "Conditions"
            placeholder: "Under what conditions does this hold?"
          - id: evidence
            label: "Evidence"
            placeholder: "Cite the supporting evidence by ref path."
          - id: scope
            label: "Scope"
            placeholder: "Where does this NOT apply?"
        joiner: "\n\n"
  ```

  The `joiner` is the string used to glue the cards together when
  assembling the draft.

- Real reorder via `dnd-kit` (add to `packages/ui` deps). Keyboard
  up/down arrows on each card stay as the a11y fallback.
- Pairs naturally with W2 (citation chips) and W3 (rubric live-glow):
  W1 ships the skeleton; W2 makes `[ref:...]` tokens visual; W3 promotes
  the presence chips from "has any text" to real-rubric heuristics.
