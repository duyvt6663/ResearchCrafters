# Frontend Design TODO

Goal: design the learner-facing UI before building the MVP web app.

Depends on: 08 (UI primitives infra). Consumed by: 01. Reads schemas from 04
(grades), 05 (mentor states + authored copy), 06 (share-card payload,
branch-stats suppression), 03 (CLI surface).

## Design Direction

- [ ] Confirm visual tone: serious research-engineering workbench.
- [ ] Define layout principles for dense technical workflows.
- [ ] Define color tokens: base, accent, semantic statuses.
- [ ] Define typography tokens.
- [ ] Define spacing and radius tokens.
- [ ] Confirm lucide icon usage.
- [ ] Confirm no nested-card page structure.
- [ ] Publish design tokens as a typed module under `packages/ui/tokens.ts` or
      a Tailwind config the rest of the codebase imports; do not duplicate
      values in component files.
- [ ] Set motion budget: subtle transitions only, no hero animations; motion
      may only communicate state change.
- [ ] Decide dark mode policy: support light and dark from MVP, or defer dark
      mode and state the deferral. Design every wireframe in the chosen mode
      set.
- [ ] Set MVP i18n stance: English-only; document the deferral so the codebase
      does not absorb i18n cost early.
- [ ] Defer authoring surfaces (preview mode, package review, graph editor,
      evidence manager, rubric editor) to Phase 4; exclude from MVP wireframes.

## Information Architecture

- [ ] Define app shell.
- [ ] Define top navigation.
- [ ] Define mobile navigation.
- [ ] Define catalog flow.
- [ ] Define package overview flow.
- [ ] Define learning session flow.
- [ ] Define branch review flow.
- [ ] Define paywall flow.
- [ ] Define share-card flow.

## Wireframes

- [ ] Catalog page.
- [ ] Package overview page.
- [ ] Learning session player desktop.
- [ ] Learning session player mobile.
- [ ] Decision stage.
- [ ] Writing stage.
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

- [ ] Design left stage map.
- [ ] Design center task workspace.
- [ ] Design right context panel.
- [ ] Define tabs for evidence, feedback, mentor, and logs.
- [ ] Define sticky primary action behavior.
- [ ] Define mobile sheet/tab behavior.
- [ ] Define locked-stage behavior.
- [ ] Define completed-stage review behavior.
- [ ] Define stage map navigation policy: free jump within unlocked stages,
      sequential-only, or hybrid. Document URL behavior to match.
- [ ] Define mid-stage paywall guard: a stage opened under entitlement must
      not be interrupted by a paywall mid-attempt. Surface paywall only at
      natural boundaries (stage load, submit on locked stage, mentor request
      without access).

## Decision Graph

- [ ] Define graph node visual states.
- [ ] Define branch visual states.
- [ ] Define hidden/locked branch behavior.
- [ ] Define provenance display for explicit, inferred, and expert-reconstructed nodes.
- [ ] Define minimum-N branch percentage display: per-node N >= 20, per-branch
      N >= 5, rounded to nearest 5%, per `06`.
- [ ] Define click interactions for graph nodes.
- [ ] Define non-spoiler previews for locked nodes.
- [ ] Define branch reveal transition: how a hidden branch animates into a
      revealed state with expert feedback. Pick one of inline expansion,
      dedicated reveal view, or graph repaint and document the rationale.
- [ ] Define rare-branch suppression copy for the hidden-percentage state.

## Feedback and Results

- [ ] Design pass state.
- [ ] Design partial-credit state.
- [ ] Design retry state.
- [ ] Design execution failure state.
- [ ] Design timeout/OOM/crash/exit-nonzero displays.
- [ ] Design rubric-dimension scoring.
- [ ] Design evidence refs in feedback.
- [ ] Design next-action guidance.

## Mentor UI

- [ ] Design mentor panel.
- [ ] Design hint mode.
- [ ] Design clarify mode.
- [ ] Design review-draft mode.
- [ ] Design explain-branch mode.
- [ ] Show allowed context for current stage.
- [ ] Show rate-limit state.
- [ ] Show paywall state.
- [ ] Show flagged-output fallback state.

## Component System

- [ ] `AppShell`.
- [ ] `TopNav`.
- [ ] `CatalogFilters`.
- [ ] `PackageCard`.
- [ ] `PackageOverview`.
- [ ] `StagePlayer`.
- [ ] `StageMap`.
- [ ] `DecisionChoiceList`.
- [ ] `AnswerEditor`.
- [ ] `EvidencePanel`.
- [ ] `RubricPanel`.
- [ ] `RunStatusPanel`.
- [ ] `GradePanel`.
- [ ] `MentorPanel`.
- [ ] `PaywallModal`.
- [ ] `ShareCardPreview`.
- [ ] `CommandBlock`.
- [ ] `StatusBadge`.
- [ ] `MetricTable`.
- [ ] `ArtifactRef`.

## Component Behaviors

The named components above need explicit interaction specs.

`AnswerEditor`:

- [ ] Draft autosave to backend with debounce.
- [ ] Insert evidence/citation refs from the evidence panel.
- [ ] Word count and rubric-criterion live indicator.
- [ ] Sanitize paste-from-clipboard.
- [ ] Undo/redo and keyboard shortcuts.
- [ ] Restore drafts on reload.

`RunStatusPanel`:

- [ ] Stream or poll run logs with scroll-to-tail toggle.
- [ ] In-panel search and severity filter.
- [ ] ANSI color rendering with safe escape handling.
- [ ] Line truncation policy with a "show full line" affordance.
- [ ] Copy log line with timestamp.
- [ ] Visually distinguish execution status (timeout, OOM, crash, exit non-zero).

`MentorPanel`:

- [ ] Show what context is allowed for the current stage policy.
- [ ] Show authored refusal copy when policy denies a request; never let the
      model generate the refusal text.
- [ ] Show rate-limit and budget-cap states from `05`.

## Copy Library

The frontend cannot ship without authored copy for safety- and tone-sensitive
strings.

- [ ] Paywall copy variants by entry point (preview boundary, locked stage,
      mentor without entitlement).
- [ ] Mentor refusal copy authored per package per `05`.
- [ ] Execution-failure copy variants: timeout, OOM, crash, exit non-zero.
- [ ] Rare-branch suppression copy used by graph and share card per `06`.
- [ ] Stale CLI version warning copy referenced by `03`.
- [ ] Runner-offline copy with retry guidance.
- [ ] Mentor-unavailable copy with degrade path.
- [ ] Stage-locked copy explaining the unlock rule.
- [ ] Empty catalog and 1-2 package early-state copy that feels intentional.
- [ ] Migration UX copy for opt-in package version migration per `06`.
- [ ] Author all copy in a single `packages/ui/copy/` module so engineers do
      not invent strings inline.

## CLI Surface Sync

Code and Experiment stages render CLI commands. They must match the canonical
CLI surface in `03-cli-runner.md`.

- [ ] Render CLI command blocks from a single source shared with `03`; never
      hardcode commands in stage markdown.
- [ ] Add a CI check that fails when stage copy references a CLI command not
      present in the canonical surface.
- [ ] Show stale-CLI warning when the local CLI version is older than the
      stage's expected minimum.

## Performance Budget

- [ ] Set TTI p95 < 2s on mid-range hardware for catalog, package overview,
      and stage player.
- [ ] Set stage transition p95 < 500ms.
- [ ] Set decision graph interactive within 1s for graphs up to 50 nodes.
- [ ] Define bundle size budget for the stage player route.
- [ ] Add Lighthouse or equivalent checks to CI.

## Mobile Fallbacks

- [ ] Mobile decision graph falls back to a tree/list view rather than a
      pannable canvas.
- [ ] Mobile code stage shows "open this stage on desktop" guidance with the
      relevant CLI command for handoff.
- [ ] Mobile experiment stage shows a read-only run status view.
- [ ] Mobile share-card capture flow supports paste-only insight entry.

## Anti-Patterns Checklist

A single design-review checklist consolidating "do not" rules from
`docs/FRONTEND.md`.

- [ ] No nested cards.
- [ ] No viewport-scaled font sizes.
- [ ] No color-only branch status indicators.
- [ ] No meme styling on share cards.
- [ ] No spoilers in locked nodes.
- [ ] No decorative motion.
- [ ] No floating CTAs that obscure work areas.
- [ ] No paywall interrupts mid-attempt on a stage already opened.
- [ ] No CLI commands hardcoded outside the canonical CLI surface.

## Responsive and Accessibility

- [ ] Define desktop breakpoint layout.
- [ ] Define tablet layout.
- [ ] Define mobile layout.
- [ ] Define keyboard navigation for stage player.
- [ ] Define focus states.
- [ ] Define tooltip behavior for icon-only controls.
- [ ] Verify color is not the only branch-status indicator.
- [ ] Verify text fits in buttons, tabs, cards, and graph nodes.

## Static Prototype

- [ ] Build static prototype for first 3 stages.
- [ ] Include one decision stage.
- [ ] Include one writing or analysis stage.
- [ ] Include one code/experiment stage shell.
- [ ] Include mentor panel placeholder.
- [ ] Include grade/result states.
- [ ] Test desktop viewport.
- [ ] Test mobile viewport.
- [ ] Review wireframes with at least one engineer and one target user before
      starting component implementation; capture revisions in this file.
- [ ] Verify the prototype against the Anti-Patterns Checklist before sign-off.

## Acceptance Criteria

- [ ] A designer or engineer can implement MVP screens from the spec without inventing the layout.
- [ ] The session player makes the next action obvious.
- [ ] Decision branches are visible but not spoiled.
- [ ] Execution failure and grade failure are clearly different.
- [ ] The UI feels like a technical workbench, not a passive course page.
