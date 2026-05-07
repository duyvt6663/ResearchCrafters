# MVP Platform TODO

Goal: build the learner-facing loop for one flagship ERP.

## Product Surface

- [ ] Create landing/catalog page with package list.
- [ ] Create package overview page with paper, skills, prerequisites, difficulty, time, and free-stage count.
- [ ] Create learning session page.
- [ ] Show current stage, progress, unlocked graph nodes, and next action.
- [ ] Support stage types: decision, writing, analysis, review, reflection.
- [ ] Support code/experiment stages by linking to CLI instructions.
- [ ] Show expert-authored branch feedback after the policy allows it.
- [ ] Show deterministic/evaluator grade results.
- [ ] Show runner logs and execution failure states.
- [ ] Add share-card preview after meaningful progress.

## Enrollment and Progress

- [ ] Add package enrollment flow.
- [ ] Pin each enrollment to `package_version_id`.
- [ ] Track active stage, completed stages, and unlocked nodes.
- [ ] Track stage attempts with answer payloads.
- [ ] Track node traversal and selected branch.
- [ ] Support resuming a package from any device.
- [ ] Preserve old enrollment history after package migration.

## Entitlement Gates

- [ ] Implement `permissions.canAccess(user, packageVersion, stage, action)`.
- [ ] Enforce access on stage load.
- [ ] Enforce access on submissions.
- [ ] Enforce access on mentor hint/feedback requests.
- [ ] Enforce access on branch feedback and solution visibility.
- [ ] Enforce access on share-card creation.
- [ ] Use `release.free_stages` plus explicit entitlements.

## UX Requirements

- [ ] First 2 stages should take under 20 minutes total.
- [ ] Decision/writing/analysis stages should work fully in the web app.
- [ ] CLI should be required only for `inputs.mode` in `{code, experiment}`.
- [ ] Execution failures should show retry guidance, not grade failure.
- [ ] Paywall should explain what unlocks, not interrupt unexpectedly.

## Error and Empty States

- [ ] Catalog empty state and 1-2 package early state both feel intentional, not
      broken.
- [ ] Runner-offline state explains the issue and offers a retry path.
- [ ] Mentor-unavailable state degrades gracefully to hints and rubric.
- [ ] Stage-locked state explains why and what unlocks it.
- [ ] Stale CLI version state instructs the learner to upgrade.

## Package Landing Page

The landing page is the primary marketing surface and must match `MARKETING.md`
section 11.

- [ ] Show paper title, skills trained, prerequisites, difficulty, and
      estimated time.
- [ ] Show a sanitized example of one decision node and its branches.
- [ ] Show one redacted example of a failed-branch lesson.
- [ ] Show one example evidence artifact at preview fidelity.
- [ ] Show pricing or waitlist call-to-action.

## Share Flow

- [ ] After meaningful progress, prompt the learner to capture an
      evidence-grounded insight in their own words.
- [ ] Offer share-card preview with the captured insight.
- [ ] Allow editing the insight before publishing.
- [ ] Apply minimum-N suppression to any cohort percentages shown.
- [ ] Generate a public URL and image asset on publish.
- [ ] Provide an unshare path that revokes the public URL.

## Acceptance Criteria

- [ ] User can start the package, complete preview stages, hit a clear paid gate, and resume.
- [ ] User can select a branch and see expert feedback.
- [ ] User can submit a web-only answer and receive a structured grade.
- [ ] User can submit a code/experiment stage through CLI and see results in web.
- [ ] Access gates are enforced through one policy function across all routes.
