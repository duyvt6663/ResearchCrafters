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
  -> Evaluator
  -> Results API
  -> Web App

Author
  -> Package Files + Preview Mode
  -> Package Registry
  -> Validation Pipeline
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
| Runner | Docker-isolated jobs first; gVisor, E2B, Modal, or microVMs later | MVP can run small tasks with strict limits before heavier sandbox operations. |
| Auth | GitHub OAuth plus email login | MVP requests minimum GitHub scope only, likely `read:user`; repository scopes wait until a real integration ships. |
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
- Run stage tests, replay checks, and mini-experiments.
- Produce raw artifacts: test outcomes, metric values, logs, output files, and declared
  result JSON at package-specified paths.
- Write logs and results to object storage.
- Return structured execution results to the API.

Boundary:

- Runner executes learner code and records raw facts.
- Evaluator never executes learner code. It parses runner artifacts and learner text
  against rubrics and thresholds.

Runner modes:

- `test`: deterministic unit/integration tests on the learner submission.
- `replay`: run against fixed cached fixtures or precomputed experiment outputs with hash
  verification. This is the default for expensive-paper evidence and should be CPU-only.
- `mini_experiment`: run a small live experiment with strict CPU, memory, and wall-clock
  caps. MVP mini-experiments are CPU-only; GPU-backed mini-experiments are a Phase 5
  paid/team feature if demand justifies the cost.

`workspace/runner.yaml` declares the mode per stage, allowed commands, resource caps,
fixture hashes, expected artifact paths, and whether network access is permitted.

Example runner contract:

```yaml
stages:
  S003:
    mode: replay
    command: ["python", "scripts/check_attention.py"]
    resources:
      cpu: 2
      memory_mb: 2048
      timeout_seconds: 45
      network: false
    fixtures:
      - path: fixtures/flash_attention/profile_case_01.json
        sha256: "..."
    outputs:
      result_json: .researchcrafters/results/S003.json
      logs: .researchcrafters/logs/S003.log
```

The runner refuses to execute a stage if any declared fixture hash mismatches.

Runner results include:

```ts
type ExecutionStatus = "ok" | "timeout" | "oom" | "crash" | "exit_nonzero";
```

MVP runner constraints:

- No outbound network from job containers by default.
- Read-only base image plus writable workspace.
- Timeouts per stage.
- No shared credentials in runner environment.
- Logs scrubbed before display.

### Evaluator

Responsibilities:

- Own non-code grading for writing, analysis, experiment-design, and review stages.
- Load schema-validated rubrics from `curriculum/rubrics/`.
- Parse runner artifacts, deterministic check outputs, metric values, and learner answers
  against rubric thresholds.
- Combine deterministic grades, expert-authored branch feedback, and constrained LLM
  grading when a rubric allows it.
- Produce a structured grade with score, rubric dimensions, evidence references, feedback,
  model metadata if an LLM was used, and reviewer/debug traces for quality audits.
- Refuse to grade claims that lack required evidence links.
- Compute a grade only when `execution_status=ok`. Timeouts, OOMs, crashes, and non-zero
  exits are execution failures, not research-grade failures.

The evaluator is the runtime owner for expert-authored feedback. The runner can produce
raw test and metric outputs, but the evaluator decides how those outputs map to stage
pass/fail, partial credit, and research-skill feedback.

LLM grading guardrails:

- Grading prompts include rubric criteria, stage instructions, and allowed evidence
  excerpts, but never raw `solutions/canonical/` text or branch solution files.
- Learner submissions are quoted inside a delimiter and explicitly tagged as untrusted.
- The grader is instructed to ignore instructions inside the learner submission.
- Package CI runs adversarial grading prompts and fails the build if canonical text,
  hidden rubric keys, or solution snippets leak into grade explanations.
- Grader output passes through a redaction step before storage/display. Redaction targets
  come from package-declared `redaction_targets`, including canonical phrases, answer
  keys, and sensitive implementation snippets.
- Every redaction emits an `evaluator_redaction_triggered` telemetry event and flags the
  attempt for review.

### AI Mentor

Responsibilities:

- Build context from the current package, stage, learner attempt, and prior feedback.
- Provide hints, questions, explanations, and writing feedback.
- Refuse to reveal canonical solutions before an attempt when stage policy disallows it.
- Keep a record of mentor messages for quality review.

Grounding controls:

- Each stage declares a `stage_policy` that controls which package files the mentor may
  see: public stage copy, ARA artifact refs, branch feedback, rubric, cached evidence,
  canonical solution, and branch solutions are separate visibility scopes.
- The context builder enforces this policy before a prompt is assembled. The mentor cannot
  retrieve `solutions/canonical/` or branch answer files unless the current stage state
  explicitly allows it.
- Mentor prompts must include non-disclosure rules and cite the rubric/evidence context
  used for feedback.
- Package CI runs leak tests: for each stage, send adversarial mentor prompts and fail the
  build if restricted canonical answers or solution snippets appear.
- Low-confidence or policy-violating mentor outputs feed an internal review queue visible
  to package authors and the platform reviewer role.

Cost controls:

- Per-user and per-package rate limits.
- Prompt-cache stage-static context such as paper summary, artifact refs, rubric, and
  branch metadata.
- Tiered model routing: cheaper model for hints and clarification, stronger model for
  evidence-grounded writing feedback.

The mentor should call package-aware retrieval tools, not scrape arbitrary repository
state or execute learner code.

### Package Validator

Responsibilities:

- Provide a `researchcrafters validate` CLI command for authors and CI.
- Run validation layers 1-4 automatically: structural schema, ARA cross-link checks,
  sandbox checks, and pedagogy checks.
- Treat expert review and beta cohort review as release workflow gates, not local CI
  checks.
- Emit machine-readable validation reports that block package publication.

Validation checks should include:

- Package, graph, stage, branch, rubric, and runner schemas parse.
- ARA links resolve across claims, experiments, code refs, trace nodes, and evidence.
- Curriculum links resolve from stage to graph node, branch, artifact ref, rubric, hint,
  fixture, and runner config.
- Branches cite evidence or explicitly declare why the branch is expert-reconstructed.
- ARA and ERP nodes with `support_level=explicit` must include non-empty `source_refs`.
- Starter workspace fails the target stage before learner work.
- Canonical solution passes all current and previous required stages.
- Mentor leak tests pass for each stage policy.
- Evaluator leak tests and redaction checks pass for each rubric that allows LLM grading.
- Pedagogy checks confirm progressive hints, clear validation mode, and non-spoiler
  feedback.

### Authoring Workflow

Responsibilities:

- Edit package files in git or a lightweight internal content workspace.
- Preview learner sessions in the web app.
- Run `researchcrafters validate` locally and in CI.
- Track expert review status and release status.
- Defer the React Flow graph editor and full authoring workbench to Phase 4.

## 5. Data Model

Core tables:

- `users`: identity, profile, GitHub handle.
- `memberships`: plan, status, billing reference.
- `entitlements`: explicit grants for trials, coupons, teams, packages, or seats. Default
  access can be derived from `memberships` plus `package_versions.release.free_stages`,
  but explicit grants make support and teams tractable.
- `packages`: stable package identity.
- `package_versions`: immutable published versions with source hash, status, release
  policy, and package build manifest.
- `package_version_patches`: cosmetic overlays for an immutable package version, with
  `patch_seq`, patch hash, changed files, allowed patch type, and publication timestamp.
- `stages`: denormalized index of package stage metadata for querying, including
  `stage_policy`, validation mode, rubric pointer, runner mode, entitlement gates, and
  share-card eligibility.
- `decision_nodes`: denormalized learner-facing graph nodes mirrored from
  `curriculum/graph.yaml`.
- `branches`: denormalized branch choices mirrored from package branch files, including
  branch type, support level, stage, evidence refs, and gated feedback visibility.
- `enrollments`: user-package progress root, pinned to a `package_version_id`.
- `node_traversals`: one row per learner visit/choice through the decision graph.
- `stage_attempts`: attempts, selected branches, answers, scores, and timestamps.
- `submissions`: code bundle metadata and target stage.
- `runs`: runner status, execution status, logs pointer, metrics, artifact pointers, and
  test results.
- `grades`: evaluator output with rubric scores, feedback, pass/fail, and model metadata
  when applicable.
- `mentor_threads`: stage-scoped mentor conversations.
- `mentor_messages`: messages plus model/provider metadata.
- `branch_stats`: rollups by package version, stage, node, branch, cohort, and time
  window. Used for "% of users picked this branch" product moments.
- `share_cards`: generated result summaries and immutable payload snapshots.
- `reviews`: expert review status for package versions.
- `events`: analytics and audit event stream.

Store package source in git/object storage, not as the only copy in Postgres. The database
should index package content for product queries, but package files remain source of truth.
On package build, mirror graph nodes and branches into Postgres for querying, analytics,
entitlement checks, and share cards.

Version policy:

- New enrollments use the latest live package version.
- Existing enrollments stay pinned to their original `package_version_id`.
- Cosmetic patches, hint copy fixes, typo fixes, and mentor prompt fixes can ship through a
  `package_version_patches` overlay with `patch_seq + 1` if they do not alter graph
  topology, validation semantics, rubric scoring, runner behavior, or solution behavior.
  Stage attempts record the active `patch_seq` for auditability.
- Structural graph, stage, rubric, runner, or solution changes require a new package
  version. Moving a learner to that version requires explicit migration or a new
  enrollment.
- Package-version migration is opt-in. Migration resets graded state for the new version,
  but preserves the prior enrollment, attempts, branch selections, mentor threads, and
  share-card history under the old `package_version_id`.

Branch-stat cohorts:

- `all_attempts`: all users who reached the decision node.
- `completers`: users who completed the package.
- `entitled_paid`: users with paid or team entitlement at the time of selection.
- `alpha_beta`: users in pre-release cohorts, excluded from public percentages by default.

Public branch percentages use minimum-N suppression. Hide cohort percentages unless the
cohort has at least 20 selections for that node and time window.

Share-card payload:

```ts
type ShareCardPayload = {
  packageSlug: string;
  packageVersionId: string;
  userDisplayName: string;
  completionStatus: "started" | "completed" | "mastered";
  scoreSummary: {
    overall: number;
    implementation?: number;
    experimentDesign?: number;
    evidenceInterpretation?: number;
    writing?: number;
  };
  hardestDecision?: {
    nodeId: string;
    title: string;
    selectedBranchId: string;
    selectedBranchLabel: string;
    branchType: "canonical" | "failed" | "suboptimal" | "ambiguous" | "extension";
    cohortSelectionPercent?: number;
  };
  insight?: string;
};
```

Telemetry taxonomy:

- `package_viewed`
- `enrollment_started`
- `stage_loaded`
- `stage_attempt_submitted`
- `branch_selected`
- `branch_feedback_unlocked`
- `branch_feedback_viewed`
- `runner_job_started`
- `runner_job_completed`
- `grade_created`
- `evaluator_redaction_triggered`
- `mentor_hint_requested`
- `mentor_feedback_requested`
- `stage_completed`
- `share_card_created`
- `paywall_viewed`
- `subscription_started`

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
`apps/worker` when background jobs become real. Add `apps/authoring` in Phase 4 when the
graph editor and richer authoring workflow are justified.

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

1. Run `researchcrafters validate` structural schema checks for package, graph, stages,
   branches, rubrics, hints, and runner config.
2. Run ARA cross-link validation across claims, experiments, source refs, trace nodes,
   branch evidence, and stage artifact refs.
3. Run sandbox validation: starter must fail target tests, canonical solution must pass
   target and previous required stages, cached fixtures must match declared hashes.
4. Run pedagogy validation: stage copy, hints, feedback, and mentor visibility policy.
5. Run mentor and evaluator leak tests for each stage policy and LLM-graded rubric.
6. Compile stage, graph, and branch indexes for the database.
7. Upload package assets and immutable source hash.
8. Require expert review before publishing `beta` or `live`.
9. Require beta cohort review before promoting a flagship package to `live`.

## 8. Key Runtime Flows

### Learner Starts a Package

1. User chooses package and language/workspace option.
2. API checks entitlement for the package preview or paid access.
3. API creates enrollment and pins the package version.
4. CLI downloads the starter workspace from object storage or the web shows clone/start
   instructions.
5. Learner opens the first entitled stage.

CLI is required only for stages with `inputs.mode` in `{code, experiment}`. Decision,
writing, analysis, review, and reflection stages must remain usable from the web app.

### Learner Submits Work

1. CLI creates a bundle containing allowed workspace files.
2. API checks entitlement for the target stage and creates a submission.
3. Bundle uploads to object storage.
4. Queue schedules a runner job using the stage's declared runner mode.
5. Runner executes tests, replay checks, or mini-experiments in isolation.
6. If `execution_status=ok`, evaluator maps raw outputs and learner answers to a
   structured grade.
7. If execution fails, UI shows timeout/OOM/crash/non-zero-exit feedback and a retry path.
   Execution failures do not increment graded-attempt counts beyond a small abuse-control
   budget.
8. Results are saved and streamed/polled back.
9. API advances stage state if validation passes.

### Learner Makes a Decision

1. Stage response is saved as a stage attempt.
2. Selected branch is written to `node_traversals`.
3. API resolves selected branch and unlocks next nodes.
4. Expert branch feedback is shown if the stage policy allows it.
5. `branch_stats` rollups update asynchronously.
6. Mentor can explain the branch if requested.

### Mentor Gives Feedback

1. Context builder loads current stage, relevant artifact refs, attempt answer, and allowed
   solution visibility.
2. Context builder applies `stage_policy` gates before loading solutions or branch
   feedback.
3. LLM gateway requests feedback with non-disclosure and rubric-grounding instructions.
4. Response is stored and shown.
5. Low-confidence, expensive, or policy-violating feedback is flagged for review.

### Author Publishes a Package

1. Author edits package files in git or the lightweight preview workflow.
2. `researchcrafters validate` runs structural, ARA, sandbox, pedagogy, mentor leak,
   evaluator leak, and redaction checks.
3. Package build mirrors graph nodes and branches into a staging tenant or isolated preview
   schema, not the live production tables.
4. Expert reviewer approves branch fairness, evidence calibration, and rubric quality.
5. Package version is published as alpha/beta/live.

### CLI Auth and Workspace Resolution

1. CLI is distributed first through npm: `npm create researchcrafters` or
   `npx researchcrafters`. Homebrew can be added once usage justifies it.
2. `researchcrafters login` uses OAuth device code flow so it works cleanly in a terminal.
3. `researchcrafters start <package>` calls the API to resolve the package version,
   entitlement, stage manifest, and signed starter-workspace URL.
4. CLI downloads the starter workspace, writes a local `.researchcrafters/config.json`,
   and prints the current stage URL.
5. `researchcrafters test` runs local smoke tests when available, then can submit to the
   remote runner for authoritative validation.

## 9. API Shape

Use typed request/response schemas from `packages/erp-schema` or `packages/api-contracts`.

Important endpoints:

```text
GET  /api/packages
GET  /api/packages/:slug
POST /api/packages/:slug/enroll
GET  /api/enrollments/:id/state
GET  /api/enrollments/:id/graph
POST /api/node-traversals
POST /api/stage-attempts
POST /api/submissions
GET  /api/runs/:id
POST /api/runs/:id/callback
GET  /api/grades/:id
POST /api/mentor/messages
POST /api/share-cards
GET  /api/entitlements
```

## 10. Access Policy

All access decisions go through one policy surface:

```ts
permissions.canAccess(user, packageVersion, stage, action)
```

Actions include:

- `view_stage`
- `submit_attempt`
- `request_mentor_hint`
- `request_mentor_feedback`
- `view_branch_feedback`
- `create_share_card`
- `view_solution`

Every route that loads stages, submits work, requests mentor help, shows branch feedback,
or creates share cards must call this policy function. The policy uses memberships,
explicit entitlements, package release settings such as `free_stages`, stage gates, package
status, and team/admin roles. This prevents free-stage logic from drifting between routes.

## 11. Security and Isolation

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
- Retain raw submission bundles for a short, explicit window by default, then delete or
  anonymize them. Keep derived run metadata, grades, and aggregate analytics separately.
- Provide a user-facing deletion path for submissions and mentor transcripts.
- Warn learners not to submit proprietary code unless a team contract explicitly covers
  retention and confidentiality.

## 12. Operational SLOs

Initial p95 targets:

- `test` mode submission to grade visible: < 30 seconds.
- `replay` mode submission to grade visible: < 60 seconds.
- `mini_experiment` mode submission to execution result visible: < 120 seconds for MVP
  CPU-only workloads.
- Mentor first token for hints: < 5 seconds.
- Mentor first token for writing feedback: < 15 seconds.
- `researchcrafters validate` on a flagship package: < 60 seconds for layers 1-4, excluding
  optional beta-cohort workflows.

If Phase 2 cannot meet these targets inside the Next.js route-handler process, split
runner callbacks, evaluator work, mentor jobs, and package validation into `apps/worker`
before adding more packages.

## 13. Phased Build Plan

Phase 1: Docs-to-static prototype

- Create schema for package, graph, stage, branch, and rubric.
- Build static package renderer from files.
- Implement one hand-authored package in `content/packages`.
- Implement `researchcrafters validate` for schema, cross-link, sandbox, and pedagogy
  checks.

Phase 2: MVP product loop

- Add auth, catalog, enrollment, stage state, progress, and simple feedback.
- Implement CLI and runner for one language/package.
- Add entitlement checks, version pinning, deterministic stage tests, runner modes, and
  evaluator output.

Phase 3: Mentor and share loop

- Add mentor gateway with package-grounded context, stage-policy gates, leak tests, and
  cost controls.
- Add hints, writing feedback, and share cards.
- Instrument completion, confusion, branch selection, branch feedback, mentor, and share
  metrics.

Phase 4: Authoring system

- Add authoring workbench, graph editor, evidence manager, review workflow, and richer
  package build pipeline.

Phase 5: Scale

- Add more packages, team plans, package analytics, and more robust runner isolation.
