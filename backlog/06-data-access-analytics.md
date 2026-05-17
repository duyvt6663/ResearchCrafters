# Data, Access, and Analytics Backlog

Goal: make progress, decisions, entitlement, privacy, and share loops reliable.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

## Core Data Model

- [x] Add `users`.
- [x] Add `memberships`.
- [x] Add `entitlements`.
- [x] Add `packages`.
- [x] Add `package_versions`.
- [x] Add `package_version_patches`.
- [x] Add `stages`.
- [x] Add `decision_nodes`.
- [x] Add `branches`.
- [x] Add `enrollments`.
- [x] Add `node_traversals`.
- [x] Add `stage_attempts`.
- [x] Add `submissions`.
- [x] Add `runs`.
- [x] Add `grades`.
- [x] Add `mentor_threads`.
- [x] Add `mentor_messages`.
- [x] Add `branch_stats`.
- [x] Add `share_cards`.
- [x] Add `reviews`.
- [x] Add `events`.

## Package Build Mirroring

- [x] Mirror stage metadata into `stages`.
- [x] Mirror `stage_policy` into `stages`.
- [x] Mirror rubric pointer into `stages`.
- [x] Mirror runner mode into `stages`.
- [x] Mirror entitlement gates into `stages`.
- [x] Mirror graph nodes into `decision_nodes`.
- [x] Mirror branch choices into `branches`.
- [ ] Compile and expose ERP trace graph data from
      `artifact/trace/exploration_tree.yaml` for the web experiment-tree UI.
- [ ] Decide whether trace graph data is mirrored into Postgres or served as a
      package-file-backed API payload.
- [ ] Store source hash and package build manifest.
- [x] Store active patch sequence.

## Access Policy

- [x] Implement `permissions.canAccess(user, packageVersion, stage, action)`.
- [x] Support `view_stage`.
- [x] Support `submit_attempt`.
- [x] Support `request_mentor_hint`.
- [x] Support `request_mentor_feedback`.
- [x] Support `view_branch_feedback`.
- [x] Support `create_share_card`.
- [x] Support `view_solution`.
- [x] Use memberships, entitlements, package status, free stages, stage gates,
      and roles.
- [x] Add tests that every route calls the policy.

## Version and Patch Policy

- [x] Pin enrollment to `package_version_id`.
- [x] New enrollments use latest live package version.
- [ ] Keep existing enrollments pinned.
- [x] Implement `package_version_patches` with `patch_seq`.
- [x] Allow only cosmetic overlays for patches.
- [x] Record active `patch_seq` on stage attempts.
- [ ] Require new package version for graph/stage/rubric/runner/solution changes.
- [ ] Make migration opt-in.
- [ ] Preserve prior enrollment, attempts, mentor threads, and share cards on migration.
- [ ] Reset graded state for migrated version.

## Branch Stats and Privacy

- [x] Define cohorts: `all_attempts`, `completers`, `entitled_paid`, `alpha_beta`.
      _(single source of truth at `packages/telemetry/src/cohorts.ts`:
      `COHORTS`, `COHORT_DEFINITIONS` carries the membership rule for each.
      QA: `qa/branch-stats-cohort-definitions-2026-05-17.md`.)_
- [x] Exclude `alpha_beta` from public percentages by default.
      _(`COHORT_DEFINITIONS.alpha_beta.includeInPublicPercentages = false`
      drives `PUBLIC_COHORTS`; `isPublicCohort` is the guard for the
      learner-facing reader path; `SCHEDULED_BRANCH_STATS_COHORTS` is
      derived from `PUBLIC_COHORTS` so the recurring rollup never writes
      alpha-beta rows. Backfill via admin trigger when needed.)_
- [ ] Compute branch stats by package version, stage, node, branch, cohort, and time window.
      _(blocked until `node_traversals` are persisted by the API instead of
      synthesized after telemetry.)_
- [x] Hide public percentages unless the cohort N for the decision node is at
      least 20.
- [x] Hide individual branch percentages unless that specific branch's N is at
      least 5; display "rare branch" copy instead.
- [x] Use suppressed display copy when N is too low.
- [x] Add tests for minimum-N suppression at both node and branch granularity.
- [x] Round displayed percentages to the nearest 5% to reduce identifiability in
      small cohorts.
- [x] Redact failed-branch labels at the catalog spoiler boundary.
      _(Iteration 7: `apps/web/lib/data/packages.ts` `redactSampleDecision`
      now strips canonical-branch labels from public catalog payloads;
      `packages/db/src/seed.ts` `buildFailedBranchLesson` writes a
      non-spoiler title.)_

## Telemetry

- [x] Emit `package_viewed`.
      _(Fired from `apps/web/app/page.tsx` (catalog surface) and
      `apps/web/app/packages/[slug]/page.tsx` (overview surface) via
      `track("package_viewed", ...)`.)_
- [x] Emit `enrollment_started`.
      _(Fired from `apps/web/app/api/packages/[slug]/enroll/route.ts` on
      successful enrollment creation.)_
- [x] Emit `stage_loaded`.
      _(Fired from `apps/web/app/enrollments/[id]/stages/[stageRef]/page.tsx`
      when the learner opens a stage.)_
- [x] Emit `stage_attempt_submitted`.
      _(Fired from `apps/web/app/api/stage-attempts/route.ts` and
      `apps/web/app/api/submissions/route.ts` when a stage attempt is
      created.)_
- [x] Emit `branch_selected`.
      _(Fired from `apps/web/app/api/node-traversals/route.ts` when a
      learner records a branch decision.)_
- [x] Emit `branch_feedback_unlocked`.
      _(Audit-grade. Fired from
      `apps/web/app/api/runs/[id]/callback/route.ts` once the runner
      reports `status==="ok"` with a `gradeId` and the stage attempt has
      a `branchId`; the decision node is resolved from the latest
      `NodeTraversal` for that (enrollment, branch).)_
- [ ] Emit `branch_feedback_viewed`.
- [x] Emit `runner_job_started`.
      _(Fired from `apps/web/app/api/submissions/[id]/finalize/route.ts`
      after enqueuing the Run row; payload carries `runId`, `submissionId`,
      `stageRef`, and `queueDeferred`.)_
- [x] Emit `runner_job_completed`.
      _(Fired from `apps/web/app/api/runs/[id]/callback/route.ts` once the
      runner reports a terminal status; payload carries `runId`,
      `submissionId`, `status`, and `durationMs`.)_
- [x] Emit `grade_created`.
      _(Audit-grade. Fired from
      `apps/worker/src/jobs/submission-run.ts` immediately after the
      grader returns a Grade row and the `StageAttempt.gradeId` mirror is
      written. The grader is idempotent on
      `(submissionId, rubricVersion, evaluatorVersion)`, so a retry
      returns the same `gradeId` and the dual-write sink dedupes
      downstream.)_
- [x] Emit `grade_overridden`.
      _(Audit-grade. Fired from
      `apps/web/app/api/grades/[id]/override/route.ts` after the
      reviewer override is persisted; payload carries `gradeId`,
      `reviewerId`, and the previous/next score tuple.)_
- [x] Emit `evaluator_redaction_triggered`.
      _(Audit-grade. Fired from `apps/web/lib/mentor-runtime.ts` at
      every redaction site — prompt-build, mid-stream, and post-stream
      — so dashboards see each trigger; payload carries
      `matchedTargets` and the relevant `submissionId`/`gradeId`.)_
- [x] Emit `mentor_hint_requested`.
      _(Fired from `apps/web/app/api/mentor/messages/route.ts` when the
      mentor request `mode === "hint"`; payload carries `enrollmentId`,
      `stageRef`, and `threadId`.)_
- [x] Emit `mentor_feedback_requested`.
      _(Fired from `apps/web/app/api/mentor/messages/route.ts` when the
      mentor request `mode !== "hint"` (the feedback / explain-branch
      branch); payload carries `enrollmentId` and `stageRef`. `threadId`
      is optional on the event and is omitted at this site because the
      mentor thread is created later in the runtime call.)_
- [ ] Emit `stage_completed`.
- [x] Emit `share_card_created`.
      _(Fired from two complementary sites so PostHog records the share
      lifecycle exactly once per surface: `apps/web/app/api/share-cards/route.ts`
      emits when the share-card row is first created with the synthesized
      `shareCardId`/`enrollmentId`/`packageVersionId`, and
      `apps/worker/src/jobs/share-card-render.ts` emits again after the
      render job assigns the durable `publicSlug`, carrying the same
      tuple plus `publicSlug` so analytics can correlate creation with
      the public URL.)_
- [ ] Emit `paywall_viewed`.
- [ ] Emit `subscription_started`.

## Events Storage

- [ ] Send all telemetry events to PostHog (or chosen analytics vendor) as the
      primary product analytics store.
- [ ] Persist a compact audit-grade copy in Postgres `events` for events that
      affect entitlement, grading, mentor policy, payments, or moderation.
- [ ] Define which events are audit-grade (e.g., `grade_created`,
      `grade_overridden`, `evaluator_redaction_triggered`, `subscription_started`,
      `branch_feedback_unlocked`).
- [ ] Define retention: PostHog 13 months, Postgres `events` indefinite for
      audit-grade rows, scrubbed to anonymized aggregates after 24 months for
      others.
- [ ] Document the dual-write contract so engineers know which store to query
      for which question.

## Migration UX

- [ ] Build an opt-in migration flow visible from the enrollment page when a
      newer live `package_version` exists.
- [ ] Show a concrete diff: which stages changed, which branches changed, and
      what graded state will reset.
- [ ] Preserve mentor threads, share cards, and prior attempts on the old
      enrollment record so the audit trail stays intact.
- [ ] Require explicit confirmation before resetting graded state.
- [ ] Allow learners to revert to the prior enrollment within a short grace
      window.

## Share Cards

- [x] Store immutable share-card payload snapshot.
      _(wired: `POST /api/share-cards` now persists a `ShareCard` row via
      `createShareCard` (`apps/web/lib/data/share-cards.ts`) with a
      synchronously-generated `publicSlug` from
      `@researchcrafters/worker.generatePublicSlug`. The full
      `ShareCardPayload` from `buildShareCardPayload` is stored in
      `ShareCard.payload` JSON so future reads are not recomputed from the
      live enrollment/package state. QA:
      `qa/share-card-payload-snapshot-2026-05-17.md`.)_
- [x] Include package slug and version.
      _(`payload.packageSlug` + `payload.packageVersionId` from
      `buildShareCardPayload`; route also writes `packageVersionId` to the
      row column for FK / indexing.)_
- [x] Include completion status.
      _(`payload.completionStatus` — `"complete"` when every authored
      stage ref is in `enrollment.completedStageRefs`, else
      `"in_progress"`.)_
- [x] Include score summary.
      _(`payload.scoreSummary = { passed, total }` derived from the
      enrollment's completed stage count and the authored stage list.)_
- [x] Include hardest decision when available.
      _(`payload.hardestDecision` — caller-supplied
      `body.hardestDecision`, falling back to the package's
      `sampleDecision.prompt`; omitted when neither is present.)_
- [x] Include selected branch and branch type.
      _(`payload.selectedBranchType` — caller-supplied
      `selectedBranchType` mapped through `mapBranchKind` so authored
      `failed` becomes the public-safe `alternative`. Branch identity
      itself lives on the StageAttempt; the snapshot pins the branch
      *type* the learner ultimately published.)_
- [ ] Include cohort selection percentage only after minimum-N suppression passes.
- [ ] Include learner-written evidence-grounded insight when available.

## Acceptance Criteria

- [ ] Branch selections can power safe share-card percentages.
      _(requires persisted `node_traversals`; current route emits telemetry and
      returns a synthesized id.)_
- [x] Free-stage access cannot drift between routes.
- [x] Package versions and patches are auditable.
- [ ] Analytics map directly to PRD success metrics.

## Open gaps from snapshot

- [x] Generate the baseline Prisma migration and make `pnpm db:migrate`
      runnable.
- [x] Replace the web package/enrollment/stage in-memory stubs with Prisma-backed
      queries through `@researchcrafters/db`.
- [x] Fix `/api/packages` to await the Prisma-backed package list. _(Tier-1
      fix landed.)_
- [x] Wire `permissions.canAccess` to live `Membership` and `Entitlement` rows.
- [x] Fix `/api/enrollments/:id/graph` to await the Prisma-backed decision
      graph. _(Tier-1 fix landed.)_
- [ ] Persist `node_traversals` and `stage_attempts` from API routes instead of
      returning synthesized ids. _(routes now Bearer-aware and 400-validate
      empty bodies; durable rows remain.)_
- [ ] Build the branch-stats rollup job (per-branch N>=5, per-node N>=20, 5%
      rounding). _(execution depends on bringing up Redis; runner-loop agent
      may retarget the port — in flight.)_
- [ ] Land the events dual-write: PostHog primary, audit-grade rows in the
      Postgres `Event` table.
- [ ] Surface the migration UX flow in the web app.
- [ ] Add privacy plumbing: encryption-at-rest fields. _(data export endpoint
      and deletion cascade workflow have landed at
      `apps/web/lib/account-cascade.ts` + `apps/web/app/api/account/{delete,export}/route.ts`;
      encryption-at-rest remains.)_
