# Roadmap TODO

## Phase 0: Concept Lock

Goal: make the first package and platform loop concrete before broad implementation.

- [ ] Choose the first flagship package: FlashAttention or ResNet.
- [ ] Define the target learner persona for the first package.
- [ ] Write a one-page package promise: what skill gap this ERP exposes.
- [ ] Draft the first 8-12 learner stages as a graph, including at least one failed branch.
- [ ] Identify the minimum executable sandbox needed for the package.
- [ ] Define the free preview boundary, usually onboarding plus first 1-2 stages.
- [ ] Interview 10-20 target users with the package outline and stage samples.

Acceptance criteria:

- [ ] One paper is selected.
- [ ] The first package has a clear canonical path, branch path, and execution strategy.
- [ ] Early users understand the value without seeing a full platform.

## Phase 1: Static Prototype

Goal: render a package from files and validate that the ERP format works.

- [ ] Stand up infra foundations from `08-infra-foundations.md`: monorepo, dev DB,
      Redis, S3, CI.
- [ ] Create `content/packages/{slug}` with `package.yaml`.
- [ ] Add `artifact/`, `curriculum/`, `workspace/`, `solutions/`, and `media/`.
- [ ] Implement package/stage/branch/rubric schemas.
- [ ] Build a static package renderer in the web app.
- [ ] Build a simple session view for decision, writing, analysis, and reflection stages.
- [ ] Implement `researchcrafters validate` for structural checks.
- [ ] Add basic ARA cross-link validation.
- [ ] Validate starter/canonical workspaces manually for the first package.

Acceptance criteria:

- [ ] A user can click through the first package locally.
- [ ] Package content validates without manual inspection.
- [ ] The first meaningful branch produces expert-authored feedback.

## Phase 2: MVP Product Loop

Goal: support real users completing the first package.

- [ ] Add auth with email and GitHub OAuth minimum scope.
- [ ] Add package catalog and package overview page.
- [ ] Add enrollment and package-version pinning.
- [ ] Add stage state, attempts, progress, and branch traversal.
- [ ] Add entitlement checks through `permissions.canAccess`.
- [ ] Add CLI for code/experiment stages.
- [ ] Add runner for `test`, `replay`, and CPU-only `mini_experiment` modes.
- [ ] Add evaluator output and structured grades.
- [ ] Add run logs and execution failure handling.
- [ ] Add basic billing or gated manual access for alpha.

Acceptance criteria:

- [ ] A learner can enroll, progress, submit, get graded, and finish the package.
- [ ] Free-stage gating is enforced consistently.
- [ ] p95 `test` submission to grade visible is under 30 seconds.
- [ ] p95 `replay` submission to grade visible is under 60 seconds.

## Phase 3: Mentor and Share Loop

Goal: add AI mentor safely and produce shareable proof of learning.

- [ ] Add mentor context builder with `stage_policy`.
- [ ] Add mentor leak tests in package CI.
- [ ] Add evaluator leak tests and redaction checks.
- [ ] Add prompt caching and per-user rate limits.
- [ ] Add share-card payload generation.
- [ ] Add `branch_stats` rollups with minimum-N suppression.
- [ ] Add telemetry for branch selection, feedback unlock, mentor requests, and share cards.
- [ ] Add internal review queue for flagged mentor/evaluator outputs.

Acceptance criteria:

- [ ] Mentor never sees or reveals restricted solution files before allowed.
- [ ] Share cards can show hardest decision and safe branch percentages.
- [ ] Users can share results without leaking low-N cohort data.

## Phase 4: Authoring System

Goal: reduce expert authoring friction after the first package proves demand.

- [ ] Add package preview environment using staging tenant or isolated preview schema.
- [ ] Add author review dashboard.
- [ ] Add graph editor with React Flow.
- [ ] Add evidence manager.
- [ ] Add rubric editor.
- [ ] Add package release workflow: alpha, beta, live, archived.
- [ ] Add package patch workflow with `package_version_patches`.

Acceptance criteria:

- [ ] A package author can edit, preview, validate, and submit a package for review.
- [ ] Expert reviewers can approve branch fairness, evidence calibration, and rubric quality.

## Phase 5: Scale

Goal: add more packages and higher-trust team workflows.

- [ ] Add second and third packages.
- [ ] Add team seats and admin dashboard.
- [ ] Add institutional/course mode.
- [ ] Add stronger sandbox isolation if usage requires it.
- [ ] Evaluate GPU-backed mini-experiments for paid/team tiers.
- [ ] Add package analytics for authors.

Acceptance criteria:

- [ ] The content pipeline can produce packages without bespoke engineering each time.
- [ ] Team training use case has enough controls to sell.
