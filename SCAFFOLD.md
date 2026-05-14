# Repo Scaffold Map

This file maps the monorepo layout to the backlog workstreams. Each folder has a
local `README.md` with the same links and notes specific to that folder.

## Top-level

- `apps/` — runnable services and user-facing apps.
- `packages/` — reusable libraries shared across apps.
- `content/` — Executable Research Packages and templates (versioned content).
- `infra/` — Docker, Terraform, and ops scripts.
- `docs/` — product, technical, and design specs.
- `backlog/` — workstream execution plans.
- `qa/` — validation reports for backlog work.

## Folder ↔ Backlog Map

| Folder                    | Owns                                                     | Primary Backlog Item               | Related Backlog Items                     |
| ------------------------- | -------------------------------------------------------- | ---------------------------------- | ----------------------------------------- |
| `apps/web/`               | learner web app, session player, catalog, paywall, share | `01-mvp-platform.md`               | `09-frontend-design.md`, `06`, `04`, `05` |
| `apps/erp-agent/`         | planned paper-to-ERP authoring orchestrator              | `12-agentic-erp-reconstruction.md` | `02`, `04`, `05`, `11`                    |
| `apps/runner/`            | sandbox runner, Docker base images, runner modes         | `03-cli-runner.md`                 | `08-infra-foundations.md`, `04`           |
| `packages/cli/`           | learner + author CLI binary                              | `03-cli-runner.md`                 | `04-validation-evaluator.md`              |
| `packages/db/`            | Prisma schema, migrations, typed client                  | `06-data-access-analytics.md`      | `08-infra-foundations.md`                 |
| `packages/erp-schema/`    | package, graph, stage, branch, rubric, runner schemas    | `04-validation-evaluator.md`       | `02-erp-content-package.md`               |
| `packages/content-sdk/`   | package loader, ARA cross-link helpers, package build    | `02-erp-content-package.md`        | `04-validation-evaluator.md`              |
| `packages/evaluator-sdk/` | rubric grader, LLM grading guardrails, redaction         | `04-validation-evaluator.md`       | `05-mentor-safety.md`, `06`               |
| `packages/ai/`            | mentor context builder, LLM gateway, leak tests          | `05-mentor-safety.md`              | `04`, `06`                                |
| `packages/ui/`            | shared components, design tokens, copy library           | `09-frontend-design.md`            | `01-mvp-platform.md`                      |
| `packages/config/`        | shared eslint, tsconfig, build config                    | `08-infra-foundations.md`          | —                                         |
| `content/packages/`       | flagship and onboarding ERPs                             | `02-erp-content-package.md`        | `04`                                      |
| `content/templates/`      | ERP authoring templates                                  | `02-erp-content-package.md`        | `04`                                      |
| `infra/`                  | Docker, Terraform, scripts, CI helpers                   | `08-infra-foundations.md`          | `03` (runner images)                      |
| `docs/`                   | spec source of truth                                     | all                                | —                                         |
| `backlog/`                | workstream plans                                         | all                                | —                                         |
| `qa/`                     | validation reports after backlog coding                  | all                                | `backlog/PROGRESS.md`                    |

## MVP vs Deferred

Per `backlog/00-roadmap.md` and `backlog/08-infra-foundations.md`, the initial set
to bring online is:

- `apps/web/`
- `apps/runner/`
- `packages/cli/`
- `packages/db/`
- `packages/erp-schema/`
- `packages/content-sdk/`
- `packages/evaluator-sdk/`
- `packages/ai/`
- `packages/ui/`
- `packages/config/`

Deferred until justified by traffic or workflow:

- `apps/api/` — split out from `apps/web` route handlers when background
  pressure appears.
- `apps/worker/` — split out when BullMQ workers grow beyond one process.
- `apps/authoring/` — Phase 4, after the first flagship package proves demand.
- `apps/erp-agent/` — backlog/12, after the hand-authored ERP process is stable
  enough to provide a quality reference for automated reconstruction.
