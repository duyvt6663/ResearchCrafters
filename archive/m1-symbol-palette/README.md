# M1 — Symbol Palette

> **Module:** math
> **Status:** archived
> **Owner:** _unassigned_
> **Created:** 2026-05-14
> **Promoted:** 2026-05-14
> **Archived:** 2026-05-14

## Goal

Let learners who can't write LaTeX still build a correct derivation. Today,
`DerivationStepList`'s `blank` step shows a `<input>` with placeholder
`\frac{dy}{dx}` (see `packages/ui/src/components/DerivationStepList.tsx:153`).
A learner who doesn't know LaTeX cannot get past that prompt.

## Hypothesis

Learners who have never written LaTeX will produce a syntactically valid
target expression for `S001M` blank step 2 (`dH/dx = dF/dx + 1`) within
60 seconds when given a click-to-assemble symbol palette, vs. >180 seconds
or abandonment in the current free-text LaTeX baseline.

## In scope

- Click-to-add tile assembly into an ordered slot of "chips".
- Per-chip removal + global "Clear".
- Live LaTeX preview (rendered via `Prose` → KaTeX, exactly the renderer the
  real workbench already uses).
- Hover tooltip on each palette tile with a plain-English gloss of the symbol.
- Visual grouping of tiles by category (Differentials, Variables, Operators,
  Numbers, Bonus symbols).
- A "show target" reveal so reviewers can compare a learner's assembly to
  the intended expression for this stage.

## Out of scope

- Drag-and-drop reordering of chips (click-to-add is enough to test the
  *concept*; the real version would use `dnd-kit` for drag).
- Cursor-aware insertion into nested structures like `\frac{}{}` sub-slots.
  Tiles in the mock are flat. The real version would model each tile as a
  small AST node with sub-slots.
- Grading or validation against the canonical answer.
- Mentor-panel interaction.
- Schema for authoring palettes per stage (today the palette is hardcoded
  to this stage's symbols).
- Accessibility audit beyond basic tab-order + ARIA labels. A11y is a gate
  for promotion, not for the mock.

## How to view

```bash
pnpm --filter @researchcrafters/web dev
# open http://localhost:3000/experiments/m1-symbol-palette
```

## Manual test script

Happy path (LaTeX-naive learner, target expression `\frac{dH}{dx} = \frac{dF}{dx} + 1`):

1. Open the experiment URL.
2. Read the step prompt at the top.
3. **Without typing**, click `dH/dx`, then `=`, then `dF/dx`, then `+`, then `1`.
4. Confirm the preview row below the slot renders the typeset expression
   `dH/dx = dF/dx + 1` (real fraction stacks, not raw `\frac`).
5. Click "Show target" — your assembly should match.

Misuse path (out-of-order assembly):

6. Click "Clear", then click `+`, then `1`, then `=`, then `dH/dx`.
7. Confirm the preview renders the malformed `+ 1 = dH/dx` (the mock does
   *not* prevent you — it only previews).
8. Hover the `∂` tile. Confirm the tooltip explains what the partial
   derivative symbol means in plain English.

Accessibility smoke:

9. Tab through the palette. Every tile should be focusable in reading order.
10. Press `Enter` on a focused tile — it should add to the slot.

## Validation criteria

- **Success looks like:** the happy path is completed by a reviewer who
  *does not know LaTeX* in under 60 s without prompting; the preview is
  legible; tooltip content makes sense for at least 4 of the 5 categories.
- **Failure looks like:** reviewers misread the preview (it's ambiguous
  which chips are which), tooltips are wordy / not pedagogically useful,
  or the chip-removal interaction is unclear.
- **Inconclusive:** reviewers complete the happy path but ask "why can't I
  just type it?" — that's a signal we need to combine palette + text input
  as alternative modes, not replace one with the other.

## Findings

Append-only.

- **2026-05-14 — repo-owner — promoted to packages/ui.** Mock validated the
  click-to-assemble interaction and the gloss-tooltip layer. Shipped as a
  generic `SymbolPalette` component (`packages/ui/src/components/SymbolPalette.tsx`)
  and an opt-in `inputMode: "palette"` field on `DerivationStep`.
- **2026-05-14 — repo-owner — archived (Phase 2 wired end-to-end).** Authoring
  added to the stage YAML schema (`stageInputsPaletteSchema` in
  `packages/erp-schema/src/schemas/stage.ts`); `001m-residual-math.yaml`
  authors a 12-tile palette; the data layer (`apps/web/lib/data/enrollment.ts`)
  surfaces it on `StageRecord.palette`; the stage page routes math stages to
  a new `MathStageView` client component
  (`apps/web/app/enrollments/[id]/stages/[stageRef]/views/MathStageView.tsx`)
  which renders `MathWorkspace` with a palette-mode blank step. Mock removed
  from the experiments registry; this folder lives on as a historical
  writeup.

## Decision

`archive` — integrated end-to-end 2026-05-14.

Open follow-ups (intentionally deferred so each can be reviewed independently):

- Per-stage palette authoring in the curriculum YAML
  (`task.inputs.mode: palette` + `task.inputs.palette`) and matching
  `@researchcrafters/content-sdk` schema. Currently palette specs are
  constructed in TypeScript by the consumer.
- Drag-and-drop reordering via `dnd-kit` (current production component
  uses click-to-add only; this is the keyboard-friendly v1).
- Persisted chip state across reloads — today the parent only sees the
  composed LaTeX string, so chip granularity is lost on remount.
- Shared symbol glossary (`content/glossary/symbols.yaml`) for the gloss
  tooltips, so symbols that recur across stages don't redefine their
  plain-English meaning per palette.

## Integration sketch

_Filled in if promoted. Likely landing zone:_

- Extend `DerivationStep` (`packages/ui/src/components/DerivationStepList.tsx:34`)
  with an optional `inputMode: "latex-text" | "palette"` and an optional
  `palette: PaletteSpec` field.
- Author the palette per stage in the curriculum YAML (e.g. a new
  `task.input.palette` block in `001m-residual-math.yaml`), shipped through
  `@researchcrafters/content-sdk`.
- Reuse the existing `value: string` (LaTeX) contract — the palette is a
  *view* over the same string the text-mode input produces, so validation
  and grading stay unchanged.
- Real DnD via `dnd-kit` (add to `packages/ui` deps). Click-to-add stays as
  the keyboard/a11y fallback.
- The gloss tooltip content lives next to each tile in the YAML; for
  symbols that appear across stages, factor out a shared
  `content/glossary/symbols.yaml`.
