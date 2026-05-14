# W2 - Question Stack

> **Module:** writing
> **Status:** draft
> **Owner:** _unassigned_
> **Created:** 2026-05-14

## Goal

Reduce first-answer friction on S001 by turning the three numbered prompts
inside "Why is going deeper not enough?" into separate answer sections in the
main panel, while moving package-stage navigation into the left rail.

## Hypothesis

Learners who answer S001 through three focused micro-sections will start a
draft sooner and miss fewer rubric dimensions than learners facing the current
single rich-text editor, because each sub-question has its own prompt, starter,
local word count, and assembled-answer preview.

## In scope

- Left rail listing package stage challenges with current, open, and locked
  states.
- Main-panel S001 prompt split into three sections: naive intuition, not
  overfitting, degradation statement.
- Section-level writing starters that insert plain text into the relevant
  answer box.
- Draft checks that mirror the three rubric concerns without invoking a real
  grader.
- Assembled-answer preview that keeps the submission artifact as one string.

## Out of scope

- Real routing between stage pages.
- Real autosave, grading, mentor calls, or submission API calls.
- Authoring schema migration.
- Replacing the promoted W1 claim skeleton.
- Mobile sheet behavior for the left rail and right checks panel.

## How to view

```bash
pnpm --filter @researchcrafters/web dev
# open http://localhost:3000/experiments/w2-question-stack
```

## Manual test script

1. Open the experiment URL.
2. Confirm the left rail shows the ResNet path with S001 selected and later
   stages visible.
3. In S001, click "Use starter" on "Naive intuition" and type a completion.
4. Edit the prefilled "Not overfitting" section.
5. Click "Use starter" on "Degradation statement" and finish the sentence.
6. Confirm the right-side draft checks move from empty to started as sections
   receive text.
7. Confirm the assembled answer joins the three sections into one final draft
   and the submit button enables only after all three sections are started.
8. Click an open challenge in the left rail and confirm the selected stage
   changes without exposing locked stage content.

## Validation criteria

- **Success looks like:** a reviewer can produce a complete 4-8 sentence S001
  answer without rereading a long prompt or moving between prompt, editor, and
  rubric panels.
- **Failure looks like:** reviewers type everything into one section, ignore
  the assembled preview, or report that the staged prompts feel slower than a
  single editor.
- **Inconclusive:** reviewers complete the task but ask for a toggle between
  question sections and a free-prose editor.

## Findings

Append-only. Each entry: `YYYY-MM-DD - <reviewer> - <one paragraph>`.

_(none yet)_

## Decision

`pending`

## Integration sketch

If validated, move this to backlog as an opt-in writing primitive rather than
a universal replacement. Production coding should start from that backlog item,
then move through a `qa/` report before this experiment is marked promoted:

- Add `QuestionStackEditor` to `packages/ui/src/components/` with a controlled
  `sections` value and an assembled string output.
- Add an optional `question_stack` block under writing-stage inputs in
  `packages/erp-schema/src/schemas/stage.ts`; keep the persisted answer as a
  single string so the evaluator contract does not change.
- Surface authored sections from `apps/web/lib/data/enrollment.ts` to the stage
  page.
- In `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx`, render
  `QuestionStackEditor` for writing stages that author `question_stack`; keep
  existing `WritingStageView`, `WritingWorkbench`, and `RichAnswerEditor`
  fallbacks.
- Replace the current handwritten left-panel stage summary with real
  `StageMap` items derived from the enrollment graph, including completed,
  current, open, and locked states.
