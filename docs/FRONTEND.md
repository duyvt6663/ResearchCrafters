# ResearchCrafters Frontend Design

Last updated: 2026-05-07

## 1. Design Goal

ResearchCrafters should feel like a serious research-engineering workbench, not a course
landing page or a paper-summary reader. The interface should keep the learner in a
high-focus loop:

1. Understand the current research situation.
2. Make a decision or submit work.
3. Inspect evidence, tests, or feedback.
4. Move to the next branch or stage.

The UI should be quiet, dense, and operational. It should help learners scan, compare,
decide, and recover from mistakes without decorative friction.

## 2. Product Surfaces

MVP surfaces:

- Public landing/catalog.
- Package overview.
- Learning session player.
- Decision graph view.
- Stage answer surfaces: decision, writing, analysis, code, experiment, review.
- Runner/evaluator result view.
- Mentor panel.
- Progress and package history.
- Share-card preview.
- Auth, entitlement, and paywall states.

Later surfaces:

- Author preview mode.
- Package review dashboard.
- Graph editor.
- Evidence manager.
- Rubric editor.
- Team dashboard.

## 3. Navigation Model

Use a simple app shell:

- Top bar: logo, catalog, current package, progress, account.
- Main content: current surface.
- Context side panel where appropriate: graph, evidence, mentor, or feedback.

Primary user paths:

- Visitor: landing/catalog -> package overview -> preview stage -> auth/paywall.
- Learner: catalog -> package overview -> resume package -> stage player.
- Learner with code task: stage player -> CLI workspace -> submit -> run result -> next stage.
- Author later: package preview -> validation report -> review workflow.

## 4. Visual System

Tone:

- Serious, precise, and work-focused.
- More like a technical lab notebook plus coding challenge runner than a marketing site.

Layout:

- Prefer full-width application bands and fixed work areas over floating decorative cards.
- Use cards only for repeated items, individual package summaries, modals, and clearly
  bounded tools.
- Do not put cards inside cards.
- Use stable dimensions for stage controls, graph nodes, toolbar buttons, status pills,
  and score blocks.

Color:

- Base: neutral light/dark surfaces, high contrast text.
- Accent: one functional primary accent for active state and CTA.
- Semantic colors: success, warning, danger, info.
- Avoid a one-note palette dominated by a single hue.

Typography:

- Use a readable sans-serif for UI.
- Use monospace for code, CLI commands, metrics, and artifact refs.
- Avoid viewport-scaled font sizes.
- Keep letter spacing at 0.

Shape:

- Default radius: 6-8px.
- Buttons and controls should be compact and predictable.
- Use lucide icons for common actions: play, check, alert, terminal, file, graph, message,
  lock, unlock, copy, external link, refresh.

## 5. App Shell

Desktop structure:

```text
+----------------------------------------------------------------------------+
| ResearchCrafters   Catalog   My Packages        Search        Account      |
+----------------------------------------------------------------------------+
|                                                                            |
| Main surface                                                               |
|                                                                            |
+----------------------------------------------------------------------------+
```

Mobile structure:

- Top bar with logo and current package.
- Bottom tab bar for package, stage, graph, mentor.
- Side panels become full-screen sheets.

## 6. Catalog Page

Purpose: help the learner choose a package quickly.

Desktop layout:

```text
+----------------------------------------------------------------------------+
| Catalog                                                                    |
| Search papers, skills, difficulty                                          |
+----------------------------------------------------------------------------+
| Filters: Difficulty  Skill  Time  Free Preview                             |
+-----------------------+-----------------------+----------------------------+
| Package card          | Package card          | Package card                |
| Paper title           | Paper title           | Paper title                 |
| Skills                | Skills                | Skills                      |
| Difficulty/time       | Difficulty/time       | Difficulty/time             |
| Progress/free stages  | Progress/free stages  | Progress/free stages        |
+-----------------------+-----------------------+----------------------------+
```

Package card content:

- Paper/package title.
- Short one-line promise.
- Skills trained.
- Difficulty and estimated time.
- Free preview count.
- Progress if enrolled.
- Release status if alpha/beta.

MVP states:

- Not started.
- Preview available.
- In progress.
- Completed.
- Locked.

## 7. Package Overview

Purpose: set expectations and start or resume the package.

Layout:

```text
+----------------------------------------------------------------------------+
| Package title                                      Start / Resume          |
| Paper metadata, difficulty, time, prerequisites                            |
+--------------------------------+-------------------------------------------+
| What you will practice         | Package graph preview                      |
| - research framing             | canonical path + hidden branches           |
| - implementation               | locked nodes shown but not spoiled          |
| - evidence interpretation      |                                           |
+--------------------------------+-------------------------------------------+
| Stage list: preview stages, locked paid stages, estimated time             |
+----------------------------------------------------------------------------+
```

Do not over-explain the product here. Show the package, expected work, and first action.

## 8. Learning Session Player

This is the core product surface.

Desktop layout:

```text
+----------------------------------------------------------------------------+
| Package title   Stage 3/12   Progress bar                  Submit / Next   |
+----------------+-------------------------------------------+---------------+
| Stage map      | Stage workspace                           | Context panel |
| - unlocked     | Prompt                                    | tabs:         |
| - current      | Task input                                | Evidence      |
| - locked       | Validation / CLI / answer area             | Feedback      |
|                |                                           | Mentor        |
+----------------+-------------------------------------------+---------------+
```

Column behavior:

- Left: stage map and branch traversal.
- Center: current task and primary action.
- Right: tabbed context panel for evidence, feedback, mentor, and run logs.

Mobile:

- Center task first.
- Stage map, evidence, feedback, mentor, and logs become tabs/sheets.
- Primary action remains sticky at bottom.

## 9. Stage Type Layouts

### Decision Stage

Purpose: force a research choice.

Elements:

- Situation prompt.
- Constraints and evidence snippets.
- Choice list with short labels and tradeoff summaries.
- Optional confidence selector.
- Submit decision button.
- After submit: branch outcome, expert feedback, cohort percentage if minimum-N passes.

Choice layout should be row-based, not oversized cards.

### Writing Stage

Purpose: train evidence-grounded research writing.

Elements:

- Prompt.
- Evidence panel.
- Rubric preview.
- Text editor.
- Submit for grading.
- Structured grade with rubric dimensions and suggested revision.

The evidence panel should make source refs easy to insert or cite.

### Analysis Stage

Purpose: interpret logs, tables, plots, or failed runs.

Elements:

- Artifact viewer.
- Question prompt.
- Answer field.
- Rubric dimensions.
- Feedback tied to evidence.

### Code Stage

Purpose: use local workflow for implementation.

Elements:

- Stage task.
- CLI command block with copy button.
- Expected files.
- Local smoke test instructions.
- Submit status.
- Run logs and test results.

CLI command block:

```bash
researchcrafters start flash-attention
researchcrafters test
researchcrafters submit
```

### Experiment Stage

Purpose: run test, replay, or mini-experiment mode.

Elements:

- Experiment setup.
- Runner mode label: `test`, `replay`, or `mini_experiment`.
- Fixture/hash status for replay.
- Resource limits.
- Execution status.
- Metrics table.
- Grade or retry path.

Execution failures must be visually distinct from grade failures.

### Reflection Stage

Purpose: compare learner path to expert reconstruction.

Elements:

- Path taken.
- Canonical path comparison.
- Failed/suboptimal branch lessons.
- Skill profile.
- Share-card preview.

## 10. Decision Graph

Use React Flow for visualization when graph interactivity is needed.

Node styles:

- Current node: active accent border.
- Completed node: success status.
- Locked node: muted with lock icon.
- Failed branch: danger status only after reveal.
- Suboptimal branch: warning status only after reveal.
- Canonical branch: success status only after reveal.
- Inferred/expert-reconstructed nodes: show provenance in details, not as visual noise.

Graph interactions:

- Click node to preview title, stage type, status, and unlock rule.
- Click completed node to review answer and feedback.
- Locked nodes should not reveal spoilers.
- Branch stats should obey minimum-N suppression.

## 11. Feedback and Grade UI

Grade panel should include:

- Overall status: passed, partial, retry, execution failed.
- Rubric dimensions.
- Evidence refs used.
- What was strong.
- What needs revision.
- Next action.

Execution failure panel should include:

- Execution status: timeout, OOM, crash, exit non-zero.
- Relevant logs.
- Retry guidance.
- Whether the attempt counted as graded.

Do not collapse execution failure into research failure.

## 12. Mentor UI

Use a right-side panel on desktop and a sheet/tab on mobile.

Mentor modes:

- Hint.
- Clarify.
- Review draft.
- Explain branch.

Mentor panel requirements:

- Show what context is allowed for the current stage.
- Disable solution-revealing requests before policy allows them.
- Label mentor output as guidance, not final grading.
- Surface citations or artifact refs when used.
- Show rate-limit or paywall states clearly.

## 13. Paywall and Entitlement UX

Paywall should appear at natural boundaries:

- After preview stages.
- Before submitting locked stages.
- Before mentor feedback if the plan does not include it.

Paywall content:

- What unlocks.
- Current progress preserved.
- Full package access.
- Mentor feedback if included.
- Result history and share cards.

Do not interrupt active writing or code submission after the user has already started a
stage they were allowed to open.

## 14. Share Card

Share card payload should render as a serious result summary:

- Package title.
- Completion status.
- Score summary.
- Hardest decision.
- Selected branch type.
- Cohort percentage only when minimum-N passes.
- Learner-written insight.

Visual style:

- Clean technical report tile.
- No meme styling.
- No hidden-answer leakage.
- Avoid low-N branch percentages.

## 15. Component Inventory

MVP components:

- `AppShell`
- `TopNav`
- `CatalogFilters`
- `PackageCard`
- `PackageOverview`
- `StagePlayer`
- `StageMap`
- `DecisionChoiceList`
- `AnswerEditor`
- `EvidencePanel`
- `RubricPanel`
- `RunStatusPanel`
- `GradePanel`
- `MentorPanel`
- `PaywallModal`
- `ShareCardPreview`
- `CommandBlock`
- `StatusBadge`
- `MetricTable`
- `ArtifactRef`

Use shared primitives for:

- Button.
- Icon button.
- Tabs.
- Dialog.
- Sheet.
- Tooltip.
- Select.
- Segmented control.
- Textarea.
- Code block.
- Progress bar.

## 16. States

Every major surface needs:

- Loading.
- Empty.
- Locked.
- Error.
- Retry.
- In progress.
- Completed.
- Partial credit.
- Execution failed.
- Offline or runner unavailable.

## 17. Accessibility

- Keyboard navigable stage player.
- Visible focus states.
- Accessible tab and dialog behavior.
- Semantic headings.
- Sufficient contrast.
- Tooltips for icon-only buttons.
- Do not rely on color alone for branch status.

## 18. MVP Design Deliverables

Before implementation, produce:

- Low-fidelity wireframes for catalog, overview, session player, decision stage, writing
  stage, code stage, result panel, mentor panel, and share card.
- Component inventory with props and states.
- Design tokens for color, typography, spacing, radius, and status colors.
- Responsive behavior notes for desktop and mobile.
- A static prototype of the first 3 stages of the flagship package.
