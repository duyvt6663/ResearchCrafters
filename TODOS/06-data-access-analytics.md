# Data, Access, and Analytics TODO

Goal: make progress, decisions, entitlement, privacy, and share loops reliable.

## Core Data Model

- [ ] Add `users`.
- [ ] Add `memberships`.
- [ ] Add `entitlements`.
- [ ] Add `packages`.
- [ ] Add `package_versions`.
- [ ] Add `package_version_patches`.
- [ ] Add `stages`.
- [ ] Add `decision_nodes`.
- [ ] Add `branches`.
- [ ] Add `enrollments`.
- [ ] Add `node_traversals`.
- [ ] Add `stage_attempts`.
- [ ] Add `submissions`.
- [ ] Add `runs`.
- [ ] Add `grades`.
- [ ] Add `mentor_threads`.
- [ ] Add `mentor_messages`.
- [ ] Add `branch_stats`.
- [ ] Add `share_cards`.
- [ ] Add `reviews`.
- [ ] Add `events`.

## Package Build Mirroring

- [ ] Mirror stage metadata into `stages`.
- [ ] Mirror `stage_policy` into `stages`.
- [ ] Mirror rubric pointer into `stages`.
- [ ] Mirror runner mode into `stages`.
- [ ] Mirror entitlement gates into `stages`.
- [ ] Mirror graph nodes into `decision_nodes`.
- [ ] Mirror branch choices into `branches`.
- [ ] Store source hash and package build manifest.
- [ ] Store active patch sequence.

## Access Policy

- [ ] Implement `permissions.canAccess(user, packageVersion, stage, action)`.
- [ ] Support `view_stage`.
- [ ] Support `submit_attempt`.
- [ ] Support `request_mentor_hint`.
- [ ] Support `request_mentor_feedback`.
- [ ] Support `view_branch_feedback`.
- [ ] Support `create_share_card`.
- [ ] Support `view_solution`.
- [ ] Use memberships, entitlements, package status, free stages, stage gates, and roles.
- [ ] Add tests that every route calls the policy.

## Version and Patch Policy

- [ ] Pin enrollment to `package_version_id`.
- [ ] New enrollments use latest live package version.
- [ ] Keep existing enrollments pinned.
- [ ] Implement `package_version_patches` with `patch_seq`.
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
- [ ] Hide public percentages unless the cohort N for the decision node is at
      least 20.
- [ ] Hide individual branch percentages unless that specific branch's N is at
      least 5; display "rare branch" copy instead.
- [ ] Use suppressed display copy when N is too low.
- [ ] Add tests for minimum-N suppression at both node and branch granularity.
- [ ] Round displayed percentages to the nearest 5% to reduce identifiability in
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

- [ ] Store immutable share-card payload snapshot.
- [ ] Include package slug and version.
- [ ] Include completion status.
- [ ] Include score summary.
- [ ] Include hardest decision when available.
- [ ] Include selected branch and branch type.
- [ ] Include cohort selection percentage only after minimum-N suppression passes.
- [ ] Include learner-written evidence-grounded insight when available.

## Acceptance Criteria

- [ ] Branch selections can power safe share-card percentages.
- [ ] Free-stage access cannot drift between routes.
- [ ] Package versions and patches are auditable.
- [ ] Analytics map directly to PRD success metrics.
