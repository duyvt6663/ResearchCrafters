# ResearchCrafters Technical Architecture

Last updated: 2026-05-07

## 1. Architecture Goals

The codebase should support three things from the beginning:

1. A learner-facing CodeCrafters-like loop: choose package, work locally, submit, test,
   receive feedback, progress through stages.
2. An ARA-compatible content system: packages are structured as executable research
   artifacts with logic, code, trace, and evidence.
3. An expert authoring workflow: create, preview, validate, review, and publish ERPs.

Non-goals for the first implementation:

- Full browser IDE.
- Heavy GPU orchestration.
- Automated marketplace.
- Fully automated paper-to-ERP conversion.
- General-purpose research notebook or project management.

## 2. System Overview

```text
Learner Browser
  -> Web App
  -> API
  -> Postgres

Learner Local Workspace
  -> ResearchCrafters CLI
  -> Submission API
  -> Object Storage
  -> Queue
  -> Sandbox Runner
  -> Results API
  -> Web App

Author
  -> Authoring Workbench
  -> Package Registry
  -> Schema Validator
  -> Preview Session
  -> Expert Review

AI Mentor
  -> Package Context Builder
  -> LLM Gateway
  -> Guardrails
  -> Feedback Store
```

The platform should treat package content as versioned source code. Product state lives in
the database; canonical learning material lives in the content package registry.

## 3. Recommended Tech Stack

| Layer | Recommendation | Reason |
|---|---|---|
| Language | TypeScript | One language across web, API, workers, CLI, and schemas. |
| Monorepo | pnpm + Turborepo | Clear package boundaries and fast local development. |
| Web | Next.js + React | Strong routing, server rendering, auth integration, and product UI velocity. |
| UI | Tailwind CSS + Radix/shadcn-style primitives | Fast implementation with accessible components. |
| Graph UI | React Flow | Authoring and learner visualization for decision graphs. |
| API | Next.js route handlers for product APIs; Fastify service when runner traffic grows | Start simple, split when operational pressure appears. |
| Database | Postgres | Relational core plus JSONB for package metadata and graph snapshots. |
| ORM | Prisma | Strong migration workflow, typed client, and enough maturity for a product with relational state. |
| Queue | Redis/Valkey + BullMQ | Submission runs, mentor jobs, package builds, and webhooks. |
| Storage | S3-compatible object storage | Submission bundles, run logs, package assets, evidence files. |
| Runner | Docker-isolated jobs first; microVMs later | MVP can run small tasks with strict limits before investing in Firecracker. |
| Auth | GitHub OAuth plus email login | Matches developer workflow and enables repository integrations later. |
| Payments | Stripe | Individual membership and team plans. |
| AI | Provider-agnostic LLM gateway | Swap models without rewriting product logic. |
| Observability | OpenTelemetry + structured logs | Runner and queue debugging will matter early. |
| Analytics | PostHog or similar | Funnel, completion, stage confusion, and share loop analytics. |

## 4. Core Services

### Web App

Responsibilities:

- Catalog and package landing pages.
- Learning session player.
- Decision graph visualization.
- Stage instructions, hints, feedback, and progress.
- Shareable scorecards.
- Authoring preview UI.

### API

Responsibilities:

- Authenticated product APIs.
- Package version resolution.
- Learner state transitions.
- Submissions and run result ingestion.
- Mentor conversation APIs.
- Admin and authoring APIs.

### CLI

Responsibilities:

- Authenticate the learner.
- Initialize or attach a local workspace.
- Run local smoke checks where possible.
- Bundle submissions.
- Submit to the runner.
- Stream run logs and show stage instructions.

Initial command surface:

```bash
researchcrafters login
researchcrafters start flash-attention
researchcrafters test
researchcrafters submit
researchcrafters status
```

### Runner

Responsibilities:

- Execute untrusted learner submissions.
- Enforce CPU, memory, wall-clock, file-size, and network limits.
- Run stage tests, metric checks, and package-specific evaluators.
- Write logs and results to object storage.
- Return structured results to the API.

MVP runner constraints:

- No outbound network from job containers by default.
- Read-only base image plus writable workspace.
- Timeouts per stage.
- No shared credentials in runner environment.
- Logs scrubbed before display.

### AI Mentor

Responsibilities:

- Build context from the current package, stage, learner attempt, and prior feedback.
- Provide hints, questions, explanations, and writing feedback.
- Refuse to reveal canonical solutions before an attempt when stage policy disallows it.
- Keep a record of mentor messages for quality review.

The mentor should call package-aware tools, not scrape arbitrary repository state.

### Authoring Workbench

Responsibilities:

- Create and edit package metadata.
- Edit curriculum graph and stages.
- Preview learner sessions.
- Validate package schemas.
- Run package tests against starter and canonical solutions.
- Track review status and release status.

## 5. Data Model

Core tables:

- `users`: identity, profile, GitHub handle.
- `memberships`: plan, status, billing reference.
- `packages`: stable package identity.
- `package_versions`: immutable published versions with source hash and status.
- `stages`: denormalized index of package stage metadata for querying.
- `enrollments`: user-package progress root.
- `stage_attempts`: attempts, selected branches, answers, scores, and timestamps.
- `submissions`: code bundle metadata and target stage.
- `runs`: runner status, logs pointer, metrics, and test results.
- `mentor_threads`: stage-scoped mentor conversations.
- `mentor_messages`: messages plus model/provider metadata.
- `share_cards`: generated result summaries.
- `reviews`: expert review status for package versions.
- `events`: analytics and audit event stream.

Store package source in git/object storage, not as the only copy in Postgres. The database
should index package content for product queries, but package files remain source of truth.

## 6. Repo Structure

Recommended initial monorepo:

```text
ResearchCrafters/
  apps/
    web/
      app/
      components/
      lib/
      public/
    api/
      src/
    worker/
      src/
    runner/
      src/
      docker/
    authoring/
      app/

  packages/
    cli/
      src/
    db/
      prisma/
      src/
    erp-schema/
      src/
      schemas/
    content-sdk/
      src/
    evaluator-sdk/
      src/
    ai/
      src/
    ui/
      src/
    config/
      eslint/
      tsconfig/

  content/
    packages/
      flash-attention/
      resnet/
    templates/
      erp-basic/

  infra/
    docker/
    terraform/
    scripts/

  docs/
```

MVP can start with `apps/web`, `packages/db`, `packages/erp-schema`,
`packages/content-sdk`, `packages/cli`, and `apps/runner`. Split `apps/api` and
`apps/worker` when background jobs become real.

## 7. Content Package Layout

Each package should be a self-contained directory:

```text
content/packages/{slug}/
  package.yaml
  artifact/
    PAPER.md
    logic/
    src/
    trace/
    evidence/
  curriculum/
    graph.yaml
    stages/
    rubrics/
    hints/
  workspace/
    starter/
    tests/
    fixtures/
    runner.yaml
  solutions/
    canonical/
    branches/
  media/
```

Build process:

1. Validate package schema.
2. Validate ARA structure.
3. Run starter tests and ensure expected failure.
4. Run canonical solution and ensure expected pass.
5. Compile stage index for the database.
6. Upload package assets and immutable source hash.

## 8. Key Runtime Flows

### Learner Starts a Package

1. User chooses package and language/workspace option.
2. API creates enrollment and resolves package version.
3. CLI downloads starter workspace or web shows clone/start instructions.
4. Learner opens first stage.

### Learner Submits Work

1. CLI creates a bundle containing allowed workspace files.
2. API creates a submission and uploads bundle to object storage.
3. Queue schedules a runner job.
4. Runner executes package-specific tests in isolation.
5. Results are saved and streamed/polled back.
6. API advances stage state if validation passes.

### Learner Makes a Decision

1. Stage response is saved as a stage attempt.
2. API resolves selected branch and unlocks next nodes.
3. Expert branch feedback is shown.
4. Mentor can explain the branch if requested.

### Mentor Gives Feedback

1. Context builder loads current stage, relevant artifact refs, attempt answer, and allowed
   solution visibility.
2. LLM gateway requests feedback with stage policy.
3. Response is stored and shown.
4. Low-confidence or policy-violating feedback is flagged for review.

### Author Publishes a Package

1. Author edits package files in git or authoring workbench.
2. Package validator runs structural, ARA, sandbox, and pedagogy checks.
3. Expert reviewer approves.
4. Package version is published as alpha/beta/live.

## 9. API Shape

Use typed request/response schemas from `packages/erp-schema` or `packages/api-contracts`.

Important endpoints:

```text
GET  /api/packages
GET  /api/packages/:slug
POST /api/packages/:slug/enroll
GET  /api/enrollments/:id/state
POST /api/stage-attempts
POST /api/submissions
GET  /api/runs/:id
POST /api/runs/:id/callback
POST /api/mentor/messages
POST /api/share-cards
```

## 10. Security and Isolation

Runner security is a product requirement, not infrastructure polish:

- Treat every submission as hostile.
- Run in isolated containers with strict cgroup limits.
- Disable network by default.
- Mount workspace with least privilege.
- Set maximum upload size and file count.
- Strip secrets from all runner environments.
- Store logs separately from application logs.
- Rate-limit submissions by user, package, and IP.
- Never let AI mentor execute learner code directly.

## 11. Phased Build Plan

Phase 1: Docs-to-static prototype

- Create schema for package, graph, stage, branch, and rubric.
- Build static package renderer from files.
- Implement one hand-authored package in `content/packages`.

Phase 2: MVP product loop

- Add auth, catalog, enrollment, stage state, progress, and simple feedback.
- Implement CLI and runner for one language/package.
- Add deterministic stage tests.

Phase 3: Mentor and share loop

- Add mentor gateway with package-grounded context.
- Add hints, writing feedback, and share cards.
- Instrument completion, confusion, and share metrics.

Phase 4: Authoring system

- Add graph editor, package preview, schema validator, review workflow, and package build
  pipeline.

Phase 5: Scale

- Add more packages, team plans, package analytics, and more robust runner isolation.
