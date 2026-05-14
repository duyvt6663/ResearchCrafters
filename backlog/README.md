# ResearchCrafters Backlog Index

This folder converts the current product, ERP, and technical specs into execution plans.

Source docs:

- `docs/PRD.md`
- `docs/PRD_v2.md`
- `docs/TECHNICAL.md`
- `docs/MARKETING.md`
- `docs/PITCH.md`
- `docs/RESEARCH_NOTES.md`
- `docs/FRONTEND.md`

## Workstreams

- `00-roadmap.md`: milestone sequence and release gates.
- `01-mvp-platform.md`: learner-facing web app and product loop.
- `02-erp-content-package.md`: first flagship ERP and package authoring tasks.
- `03-cli-runner.md`: local workflow, submission, sandbox, and runner modes.
- `04-validation-evaluator.md`: package validator, rubric grading, and evaluator service.
- `05-mentor-safety.md`: AI mentor, policy gates, leak tests, and cost controls.
- `06-data-access-analytics.md`: database, entitlements, telemetry, branch stats, and share cards.
- `07-alpha-launch.md`: alpha cohort, pricing, GTM, and launch readiness.
- `08-infra-foundations.md`: monorepo, environments, database, queue, storage, observability, and CI scaffolding that everything else depends on.
- `09-frontend-design.md`: visual direction, screen layouts, stage-player UX, components, and responsive behavior.
- `10-integration-quality-gaps.md`: current end-to-end quality gaps found by local web/API/CLI testing.
- `11-learning-modules-math-writing.md`: interactive math modules and academic writing modules for research-skill depth.
- `12-agentic-erp-reconstruction.md`: agentic paper-to-ERP authoring workflow using the existing package, validator, and review gates.

## Execution Rule

The first release should prove one claim: a serious AI engineer will pay for one excellent
executable paper package because it exposes research-thinking gaps that passive reading
and code copying do not.

## Delivery Workflow

Backlog items move through this exact path:

`backlog → backlog refinement → coding → qa → done`

- Implementation work starts from a checked or unchecked item in this folder.
- Backlog is a planning state, not automatic permission to code. Before
  implementation, check whether the item is still current against the codebase,
  linked docs, experiment writeups, archive notes, and prior QA reports.
- If the item is stale, unclear, too large, or missing validation criteria,
  refine it here before coding. Add current-state notes, exact scope, non-goals,
  implementation sketch, dependencies, acceptance criteria, and the QA commands
  or manual checks that should prove it works.
- If the next step is scaffolding, do the smallest useful scaffold first and
  fold the result back into the backlog item. Examples: a UX mock in
  `apps/web/experiments/`, a content/schema template, a throwaway technical
  spike, a fixture, or a test harness that clarifies the implementation path.
- If refinement shows the item has already shipped or is superseded, update the
  backlog with evidence and send only the verification work to `qa/`.
- After coding, validate the work in the QA step before marking the backlog
  item done. QA reports live in the repo-root `qa/` folder.
- If QA passes, update the relevant backlog item and `PROGRESS.md` when the
  integrated snapshot changed.
- If QA fails, document the failure in `qa/`, keep or reopen the backlog item
  with reproduction notes, and continue from backlog rather than marking the
  work complete.
- Validated UX experiments enter backlog before production coding; do not
  implement directly from `apps/web/experiments/<slug>/`.

## Suggested Order

1. Lock the first flagship paper and authoring scope.
2. Stand up infra foundations from `08` (monorepo, DB, queue, storage, CI).
3. Implement schemas and static package rendering.
4. Design the frontend from `09` before coding the session player.
5. Build `researchcrafters validate`.
6. Build the web learning loop for decision/math/writing/analysis stages.
7. Add CLI and runner only for code/experiment stages.
8. Add evaluator and mentor safety gates.
9. Upgrade the flagship package with one interactive math module and one academic writing module.
10. Add entitlements, progress, telemetry, and share cards.
11. Run alpha with 20-50 target users.
12. Build the agentic ERP reconstruction workflow after the hand-authored package process is stable enough to serve as a quality reference.
