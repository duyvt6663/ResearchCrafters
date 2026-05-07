# Frontend Design TODO

Goal: design the learner-facing UI before building the MVP web app.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

Depends on: 08 (UI primitives infra). Consumed by: 01. Reads schemas from 04
(grades), 05 (mentor states + authored copy), 06 (share-card payload,
branch-stats suppression), 03 (CLI surface).

## Design Direction

- [x] Confirm visual tone: serious research-engineering workbench.
- [x] Define layout principles for dense technical workflows.
- [x] Define color tokens: base, accent, semantic statuses.
- [x] Define typography tokens.
- [x] Define spacing and radius tokens.
- [x] Confirm lucide icon usage.
- [x] Confirm no nested-card page structure.
- [x] Publish design tokens as a typed module under `packages/ui/tokens.ts` or
      a Tailwind config the rest of the codebase imports; do not duplicate
      values in component files.
- [x] Set motion budget: subtle transitions only, no hero animations; motion
      may only communicate state change.
- [x] Decide dark mode policy: support light and dark from MVP, or defer dark
      mode and state the deferral. Design every wireframe in the chosen mode
      set.
- [x] Set MVP i18n stance: English-only; document the deferral so the codebase
      does not absorb i18n cost early.
- [x] Defer authoring surfaces (preview mode, package review, graph editor,
      evidence manager, rubric editor) to Phase 4; exclude from MVP wireframes.

## Information Architecture

- [x] Define app shell.
- [x] Define top navigation.
- [ ] Define mobile navigation.
- [x] Define catalog flow.
- [x] Define package overview flow.
- [x] Define learning session flow.
- [x] Define branch review flow.
- [x] Define paywall flow.
- [x] Define share-card flow.

## Wireframes

- [ ] Catalog page.
- [ ] Package overview page.
- [ ] Learning session player desktop.
- [ ] Learning session player mobile.
- [ ] Decision stage.
- [ ] Interactive math stage.
- [ ] Writing stage.
- [ ] Academic writing workshop stage.
- [ ] Analysis stage.
- [ ] Code stage with CLI commands.
- [ ] Experiment stage with run status.
- [ ] Reflection stage.
- [ ] Mentor panel.
- [ ] Grade panel.
- [ ] Execution failure panel.
- [ ] Paywall modal.
- [ ] Share-card preview.


## Stage Player

- [x] Design left stage map.
- [x] Design center task workspace.
- [x] Design right context panel.
- [x] Define tabs for evidence, feedback, mentor, and logs.
- [x] Define sticky primary action behavior.
- [ ] Define mobile sheet/tab behavior. _(decision-graph fallback
      shipped via `DecisionGraphMobile` in iterations 4+5; stage-player
      sheet/tab UI for code/experiment stages still open.)_
- [x] Define locked-stage behavior.
- [x] Define completed-stage review behavior.
- [x] Define stage map navigation policy: free jump within unlocked stages,
      sequential-only, or hybrid. Document URL behavior to match.
- [x] Define mid-stage paywall guard: a stage opened under entitlement must
      not be interrupted by a paywall mid-attempt. Surface paywall only at
      natural boundaries (stage load, submit on locked stage, mentor request
      without access).

## Decision Graph

Implementation note: the items in this section are design-spec coverage, not
React Flow implementation completion. The current web app still renders a graph
placeholder. `/api/enrollments/:id/graph` now returns the awaited graph
(Tier-1 fix landed); React Flow rendering itself is deferred to Phase 4.

- [x] Define graph node visual states.
- [x] Define branch visual states.
- [x] Define hidden/locked branch behavior.
- [x] Define provenance display for explicit, inferred, and expert-reconstructed nodes.
- [x] Define minimum-N branch percentage display: per-node N >= 20, per-branch
      N >= 5, rounded to nearest 5%, per `06`.
- [x] Define click interactions for graph nodes.
- [x] Define non-spoiler previews for locked nodes.
- [ ] Define branch reveal transition: how a hidden branch animates into a
      revealed state with expert feedback. Pick one of inline expansion,
      dedicated reveal view, or graph repaint and document the rationale.
- [x] Define rare-branch suppression copy for the hidden-percentage state.

## Experiment Tree Visualization

The ERP/ARA trace tree is distinct from the learner-facing curriculum graph.
`artifact/trace/exploration_tree.yaml` should become a first-class visual surface
for understanding the research process: observations, hypotheses, decisions,
failed branches, suboptimal branches, evidence, and synthesis.

- [ ] Define the experiment-tree UI model from `artifact/trace/exploration_tree.yaml`
      nodes and edges.
- [ ] Preserve the distinction between curriculum nodes (`curriculum/graph.yaml`)
      and trace nodes (`artifact/trace/exploration_tree.yaml`) in labels, copy,
      and API payloads.
- [ ] Link trace branch nodes back to authored curriculum branches through
      `branch_id` so learner decisions can be compared with the reconstructed
      research path.
- [ ] Add a learner-facing `ExperimentTree` / `ResearchTraceGraph` component,
      likely React Flow on desktop with a mobile tree/list fallback.
- [ ] Show artifact references on trace nodes: logic claims, evidence tables,
      source refs, and cached experiment outputs.
- [ ] Add a package or enrollment API endpoint that returns a compiled trace
      graph payload suitable for the web UI.
- [ ] Add Playwright smoke coverage for opening the experiment tree on the
      package overview or stage context panel.

## Feedback and Results

- [x] Design pass state.
- [x] Design partial-credit state.
- [x] Design retry state.
- [x] Design execution failure state.
- [x] Design timeout/OOM/crash/exit-nonzero displays.
- [x] Design rubric-dimension scoring.
- [x] Design evidence refs in feedback.
- [x] Design next-action guidance.

## Interactive Math UI

- [ ] Define `MathWorkspace` layout for derivation, shape, numeric, and
      explanation inputs.
- [ ] Define `DerivationStepList` with locked givens, editable blanks, per-step
      validation, and per-step hints.
- [ ] Define `ShapeTableEditor` for tensor dimensions, parameter counts, and
      memory-layout reasoning.
- [ ] Define `ToyExamplePanel` for small numeric examples with immediate sanity
      feedback.
- [ ] Define how math grades display partial credit without revealing canonical
      derivations before policy allows it.
- [ ] Verify equations render cleanly on desktop and mobile; prefer
      Markdown/KaTeX before adding a full symbolic editor.

## Academic Writing UI

- [ ] Define `WritingWorkbench` layout with evidence, draft, rubric, mentor
      review, and revision panes.
- [ ] Define `ClaimEvidenceMatrix` so sentence-level claims map to evidence
      refs or explicit caveats.
- [ ] Define citation insertion from the evidence panel with verification
      status.
- [ ] Define `RevisionDiff` for claim surgery and reviewer-rebuttal edits.
- [ ] Define `ReviewerPanel` for fixed reviewer criticism and response
      constraints.
- [ ] Ensure writing modules feel like active editorial drills, not generic
      essay boxes.

## Mentor UI

- [x] Design mentor panel.
- [x] Design hint mode.
- [x] Design clarify mode.
- [x] Design review-draft mode.
- [x] Design explain-branch mode.
- [x] Show allowed context for current stage.
- [x] Show rate-limit state.
- [x] Show paywall state.
- [x] Show flagged-output fallback state.

## Component System

- [x] `AppShell`.
- [x] `TopNav`.
- [x] `CatalogFilters`.
- [x] `PackageCard`.
- [x] `PackageOverview`.
- [x] `StagePlayer`.
- [x] `StageMap`.
- [x] `DecisionChoiceList`.
- [ ] `MathWorkspace`.
- [ ] `DerivationStepList`.
- [ ] `ShapeTableEditor`.
- [ ] `ToyExamplePanel`.
- [x] `AnswerEditor`.
- [ ] `WritingWorkbench`.
- [ ] `ClaimEvidenceMatrix`.
- [ ] `RevisionDiff`.
- [ ] `ReviewerPanel`.
- [x] `EvidencePanel`.
- [x] `RubricPanel`.
- [x] `RunStatusPanel`.
- [x] `GradePanel`.
- [x] `MentorPanel`.
- [x] `PaywallModal`.
- [x] `ShareCardPreview`.
- [x] `CommandBlock`.
- [x] `StatusBadge`.
- [x] `MetricTable`.
- [x] `ArtifactRef`.

## Component Behaviors

The named components above need explicit interaction specs.

`AnswerEditor`:

- [x] Draft autosave to backend with debounce.
- [ ] Insert evidence/citation refs from the evidence panel.
- [ ] Word count and rubric-criterion live indicator.
- [x] Sanitize paste-from-clipboard.
- [x] Undo/redo and keyboard shortcuts.
- [x] Restore drafts on reload.

`RunStatusPanel`:

- [x] Stream or poll run logs with scroll-to-tail toggle.
- [x] In-panel search and severity filter.
- [x] ANSI color rendering with safe escape handling.
- [ ] Line truncation policy with a "show full line" affordance.
- [x] Copy log line with timestamp.
- [x] Visually distinguish execution status (timeout, OOM, crash, exit non-zero).

`MentorPanel`:

- [x] Show what context is allowed for the current stage policy.
- [x] Show authored refusal copy when policy denies a request; never let the
      model generate the refusal text.
- [x] Show rate-limit and budget-cap states from `05`.

## Copy Library

The frontend cannot ship without authored copy for safety- and tone-sensitive
strings.

- [x] Paywall copy variants by entry point (preview boundary, locked stage,
      mentor without entitlement).
- [ ] Mentor refusal copy authored per package per `05`. _(stubbed)_
- [x] Execution-failure copy variants: timeout, OOM, crash, exit non-zero.
- [x] Rare-branch suppression copy used by graph and share card per `06`.
- [x] Stale CLI version warning copy referenced by `03`.
- [x] Runner-offline copy with retry guidance.
- [x] Mentor-unavailable copy with degrade path.
- [x] Stage-locked copy explaining the unlock rule.
- [x] Empty catalog and 1-2 package early-state copy that feels intentional.
- [ ] Migration UX copy for opt-in package version migration per `06`.
- [x] Author all copy in a single `packages/ui/copy/` module so engineers do
      not invent strings inline.

## CLI Surface Sync

Code and Experiment stages render CLI commands. They must match the canonical
CLI surface in `03-cli-runner.md`.

- [x] Render CLI command blocks from a single source shared with `03`; never
      hardcode commands in stage markdown.
- [x] Add a CI check that fails when stage copy references a CLI command not
      present in the canonical surface.
- [x] Show stale-CLI warning when the local CLI version is older than the
      stage's expected minimum.

## Performance Budget

- [ ] Set TTI p95 < 2s on mid-range hardware for catalog, package overview,
      and stage player.
- [ ] Set stage transition p95 < 500ms.
- [ ] Set decision graph interactive within 1s for graphs up to 50 nodes.
- [ ] Define bundle size budget for the stage player route.
- [ ] Add Lighthouse or equivalent checks to CI.

## Mobile Fallbacks

- [x] Mobile decision graph falls back to a tree/list view rather than a
      pannable canvas. _(Iterations 4+5: `DecisionGraphMobile`
      (`packages/ui/src/components/DecisionGraphMobile.tsx`) shipped with
      spoiler discipline as a second line of defense (no canonical-branch
      labels until policy allows). Wired into
      `apps/web/app/packages/[slug]/page.tsx`. Pinned by
      `packages/ui/test/decision-graph-mobile.test.tsx` (5 cases).)_
- [x] Mobile code stage shows "open this stage on desktop" guidance with the
      relevant CLI command for handoff.
- [ ] Mobile experiment stage shows a read-only run status view.
- [ ] Mobile share-card capture flow supports paste-only insight entry.

## Anti-Patterns Checklist

A single design-review checklist consolidating "do not" rules from
`docs/FRONTEND.md`.

- [x] No nested cards.
- [x] No viewport-scaled font sizes.
- [x] No color-only branch status indicators.
- [x] No meme styling on share cards.
- [x] No spoilers in locked nodes.
- [x] No decorative motion.
- [x] No floating CTAs that obscure work areas.
- [x] No paywall interrupts mid-attempt on a stage already opened.
- [x] No CLI commands hardcoded outside the canonical CLI surface.

## Responsive and Accessibility

- [x] Define desktop breakpoint layout.
- [x] Define tablet layout.
- [ ] Define mobile layout.
- [x] Define keyboard navigation for stage player.
- [x] Define focus states.
- [x] Define tooltip behavior for icon-only controls.
- [x] Verify color is not the only branch-status indicator.
- [ ] Verify text fits in buttons, tabs, cards, and graph nodes.
      _(Tailwind v4 utility generation is fixed in `apps/web` (Tier-1 fix);
      `globals.css` now `@import "tailwindcss"` + `@source
      ../../../packages/ui/src/...` so `packages/ui` classes are emitted.
      Add Playwright visual / overflow assertions to confirm desktop and
      mobile.)_

## Static Prototype

- [x] Build static prototype for first 3 stages.
- [x] Include one decision stage.
- [x] Include one writing or analysis stage.
- [x] Include one code/experiment stage shell.
- [x] Include mentor panel placeholder.
- [x] Include grade/result states.
- [x] Test desktop viewport.
- [ ] Test mobile viewport.
- [ ] Review wireframes with at least one engineer and one target user before
      starting component implementation; capture revisions in this file.
- [ ] Verify the prototype against the Anti-Patterns Checklist before sign-off.

## Acceptance Criteria

- [x] A designer or engineer can implement MVP screens from the spec without inventing the layout.
- [x] The session player makes the next action obvious.
- [x] Decision branches are visible but not spoiled.
- [x] Execution failure and grade failure are clearly different.
- [x] The UI feels like a technical workbench, not a passive course page.

## Open gaps from snapshot

- [ ] Review the static prototype with one engineer and one target user.
- [ ] Capture the wireframe set called for in `Wireframes`.
- [ ] Define mobile fallbacks for code/experiment stages beyond the
      current skeleton. _(Decision-graph fallback shipped — see
      `DecisionGraphMobile`. Stage-player sheet UI for code/experiment
      stages still open.)_
- [ ] Instrument a performance budget (Lighthouse / TTI in CI).
- [ ] Formalize the Anti-Patterns Checklist sign-off process.
- [ ] Pick the branch reveal transition (inline expansion / dedicated reveal /
      graph repaint) and document the rationale.
- [ ] Add automated visual assertions for page overflow and mobile layout.
      _(Tailwind v4 utility scanning fix landed; visual assertions now
      meaningful.)_
- [ ] UI polish for catalog/overview/stage layouts, AppShell, dark-mode
      toggle. _(in flight)_
