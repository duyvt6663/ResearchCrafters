# MVP Platform TODO

Goal: build the learner-facing loop for one flagship ERP.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

## Product Surface

- [x] Create landing/catalog page with package list.
- [x] Create package overview page with paper, skills, prerequisites, difficulty, time, and free-stage count.
- [x] Create learning session page.
- [x] Show current stage, progress, unlocked graph nodes, and next action.
- [x] Support stage types: decision, writing, analysis, review, reflection.
- [x] Support code/experiment stages by linking to CLI instructions.
- [x] Show expert-authored branch feedback after the policy allows it.
- [ ] Show deterministic/evaluator grade results.
      _(UI components exist; runner/evaluator grade persistence is not wired
      end-to-end.)_
- [ ] Show runner logs and execution failure states.
      _(UI components and APIs exist; submitted runs remain queued with empty
      logs until runner enqueue/callback persistence lands.)_
- [ ] Add share-card preview after meaningful progress.
      _(preview component exists; share-card API/page still use stub payloads.)_

## Enrollment and Progress

- [x] Add package enrollment flow.
- [x] Pin each enrollment to `package_version_id`.
- [x] Track active stage, completed stages, and unlocked nodes.
- [x] Track stage attempts with answer payloads.
- [ ] Track node traversal and selected branch.
      _(route emits telemetry and returns a synthesized id, but does not persist
      `node_traversals` rows.)_
- [ ] Support resuming a package from any device.
- [ ] Preserve old enrollment history after package migration.

## Entitlement Gates

- [x] Implement `permissions.canAccess(user, packageVersion, stage, action)`.
- [x] Enforce access on stage load.
- [x] Enforce access on submissions.
- [x] Enforce access on mentor hint/feedback requests.
- [x] Enforce access on branch feedback and solution visibility.
- [x] Enforce access on share-card creation.
- [x] Use `release.free_stages` plus explicit entitlements.

## UX Requirements

- [ ] First 2 stages should take under 20 minutes total.
- [x] Decision/writing/analysis stages should work fully in the web app.
      _(writing and decision stages render after the client-boundary fixes;
      submit/grade/branch persistence still needs E2E wiring)_
- [x] CLI should be required only for `inputs.mode` in `{code, experiment}`.
- [x] Execution failures should show retry guidance, not grade failure.
- [x] Paywall should explain what unlocks, not interrupt unexpectedly.

## Error and Empty States

- [x] Catalog empty state and 1-2 package early state both feel intentional, not
      broken.
- [x] Runner-offline state explains the issue and offers a retry path.
- [x] Mentor-unavailable state degrades gracefully to hints and rubric.
- [x] Stage-locked state explains why and what unlocks it.
- [x] Stale CLI version state instructs the learner to upgrade.

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

- [x] After meaningful progress, prompt the learner to capture an
      evidence-grounded insight in their own words.
- [x] Offer share-card preview with the captured insight.
- [x] Allow editing the insight before publishing.
- [x] Apply minimum-N suppression to any cohort percentages shown.
- [ ] Generate a public URL and image asset on publish.
- [ ] Provide an unshare path that revokes the public URL.

## Acceptance Criteria

- [x] User can start the package, complete preview stages, hit a clear paid gate, and resume.
- [x] User can select a branch and see expert feedback.
- [ ] User can submit a web-only answer and receive a structured grade.
      _(stage-attempt route returns queued attempts only; grade persistence is
      still pending.)_
- [ ] User can submit a code/experiment stage through CLI and see results in web.
- [x] Access gates are enforced through one policy function across all routes.
      _(function exists; live membership/entitlement correctness is tracked in
      `10-integration-quality-gaps.md`)_

## Open gaps from snapshot

- [x] Choose an auth provider (NextAuth / Clerk / in-house) and wire DB-backed sessions in `lib/auth.ts`.
      _(NextAuth v5 + Prisma adapter; GitHub provider; magic-link deferred)_
- [x] Fix `/api/packages` so the API returns the awaited Prisma-backed package
      list instead of `{}`. _(Tier-1 fix landed: `await listPackages()`.)_
- [x] Replace the stubbed `permissions.canAccess` entitlement branch with live
      `Membership` + `Entitlement` reads.
- [x] Automate the package overview and stage-player browser smoke path from
      `10-integration-quality-gaps.md`. _(Playwright specs at `tests/e2e/`)_
- [ ] Wire `lib/telemetry.ts` `track()` to a real analytics destination.
- [ ] Render the React Flow decision graph (deferred to Phase 4).
- [x] Fix `/api/enrollments/:id/graph` so it returns the awaited Prisma-backed
      graph instead of `{}`. _(Tier-1 fix landed: `await getDecisionGraph(id)`.)_
- [x] Fix Tailwind package-source scanning / config so `packages/ui` utility
      classes render correctly and pages do not overflow horizontally.
      _(Tier-1 fix landed: `apps/web/app/globals.css` migrated to v4
      `@import "tailwindcss"` + `@source ../../../packages/ui/src/...`; dead
      `apps/web/tailwind.config.ts` removed; CSS payload 109 → ~1328 lines.)_
- [ ] Generate real share-card public URLs and image assets.
- [ ] Review the static prototype with target users.
- [ ] UI polish for catalog/overview/stage layouts, AppShell, dark-mode
      toggle. _(in flight)_
- [ ] CLI/entitlements polish: `lastRunId` persistence, `slug@slug@stub`
      rendering fix, drop dead `EnrollResponse` fields, replace
      `/api/entitlements` stub with live Prisma reads. _(in flight)_
