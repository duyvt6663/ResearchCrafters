# ResearchCrafters TODO Index

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

## Execution Rule

The first release should prove one claim: a serious AI engineer will pay for one excellent
executable paper package because it exposes research-thinking gaps that passive reading
and code copying do not.

## Suggested Order

1. Lock the first flagship paper and authoring scope.
2. Stand up infra foundations from `08` (monorepo, DB, queue, storage, CI).
3. Implement schemas and static package rendering.
4. Design the frontend from `09` before coding the session player.
5. Build `researchcrafters validate`.
6. Build the web learning loop for decision/writing/analysis stages.
7. Add CLI and runner only for code/experiment stages.
8. Add evaluator and mentor safety gates.
9. Add entitlements, progress, telemetry, and share cards.
10. Run alpha with 20-50 target users.
