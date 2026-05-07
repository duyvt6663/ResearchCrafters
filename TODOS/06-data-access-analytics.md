# Data, Access, and Analytics TODO

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
- [ ] Use memberships, entitlements, package status, free stages, stage gates,
      and roles. _(route policy exists, but still has stubbed `u-paid` logic;
      async/Prisma rewrite in flight — call sites updated, source/test cleanup
      pending)_
- [x] Add tests that every route calls the policy.

## Version and Patch Policy

- [x] Pin enrollment to `package_version_id`.
- [ ] New enrollments use latest live package version.
- [ ] Keep existing enrollments pinned.
- [x] Implement `package_version_patches` with `patch_seq`.
- [ ] Allow only cosmetic overlays for patches.
- [ ] Record active `patch_seq` on stage attempts.
- [ ] Require new package version for graph/stage/rubric/runner/solution changes.
- [ ] Make migration opt-in.
- [ ] Preserve prior enrollment, attempts, mentor threads, and share cards on migration.
- [ ] Reset graded state for migrated version.

## Branch Stats and Privacy

- [ ] Define cohorts: `all_attempts`, `completers`, `entitled_paid`, `alpha_beta`.
- [ ] Exclude `alpha_beta` from public percentages by default.
- [ ] Compute branch stats by package version, stage, node, branch, cohort, and time window.
- [x] Hide public percentages unless the cohort N for the decision node is at
      least 20.
- [x] Hide individual branch percentages unless that specific branch's N is at
      least 5; display "rare branch" copy instead.
- [x] Use suppressed display copy when N is too low.
- [x] Add tests for minimum-N suppression at both node and branch granularity.
- [x] Round displayed percentages to the nearest 5% to reduce identifiability in
      small cohorts.

## Telemetry

- [ ] Emit `package_viewed`.
- [ ] Emit `enrollment_started`.
- [ ] Emit `stage_loaded`.
- [ ] Emit `stage_attempt_submitted`.
- [ ] Emit `branch_selected`.
- [ ] Emit `branch_feedback_unlocked`.
- [ ] Emit `branch_feedback_viewed`.
- [ ] Emit `runner_job_started`.
- [ ] Emit `runner_job_completed`.
- [ ] Emit `grade_created`.
- [ ] Emit `grade_overridden`.
- [ ] Emit `evaluator_redaction_triggered`.
- [ ] Emit `mentor_hint_requested`.
- [ ] Emit `mentor_feedback_requested`.
- [ ] Emit `stage_completed`.
- [ ] Emit `share_card_created`.
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
- [x] Include package slug and version.
- [x] Include completion status.
- [x] Include score summary.
- [x] Include hardest decision when available.
- [x] Include selected branch and branch type.
- [x] Include cohort selection percentage only after minimum-N suppression passes.
- [x] Include learner-written evidence-grounded insight when available.

## Acceptance Criteria

- [x] Branch selections can power safe share-card percentages.
- [x] Free-stage access cannot drift between routes.
- [x] Package versions and patches are auditable.
- [ ] Analytics map directly to PRD success metrics.

## Open gaps from snapshot

- [x] Generate the baseline Prisma migration and make `pnpm db:migrate`
      runnable.
- [x] Replace the web package/enrollment/stage in-memory stubs with Prisma-backed
      queries through `@researchcrafters/db`.
- [ ] Fix `/api/packages` to await the Prisma-backed package list.
- [ ] Wire `permissions.canAccess` to live `Membership` and `Entitlement` rows.
- [ ] Build the branch-stats rollup job (per-branch N>=5, per-node N>=20, 5%
      rounding).
- [ ] Land the events dual-write: PostHog primary, audit-grade rows in the
      Postgres `Event` table.
- [ ] Surface the migration UX flow in the web app.
- [ ] Add privacy plumbing: encryption-at-rest fields, data export endpoint,
      deletion cascade workflow.
