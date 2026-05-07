# CLI and Runner TODO

Goal: support local-first CodeCrafters-style work for code and experiment stages.

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Checkboxes below
reflect that snapshot.

Depends on: 08 (auth, signed URLs, runner base images). Used by: 01, 04.

## CLI Surface

The same binary hosts learner and author subcommands. Subcommand groups gate
behavior by the user's role and entitlement.

Learner commands:

- [x] `researchcrafters login` (OAuth device code flow).
- [x] `researchcrafters logout` (revoke and clear local token).
- [x] `researchcrafters start <package>`.
- [x] `researchcrafters test` (local smoke tests).
- [x] `researchcrafters submit` (bundle and upload).
- [x] `researchcrafters status` (current stage + last run).
- [x] `researchcrafters logs <run-id>` (stream or poll run logs).

Author commands (cross-reference 04):

- [x] `researchcrafters validate <package-path>` (layers 1-4).
- [x] `researchcrafters preview <package-path>` (open the local package in the
      preview environment).
- [x] `researchcrafters build <package-path>` (compile indexes and prepare upload).

Common:

- [x] `researchcrafters --version` and version-mismatch warning when the local
      CLI is older than the server expects.
- [ ] Shell completion for bash, zsh, and fish.

## CLI Foundations

- [x] Decide CLI package name and distribution path.
- [ ] Implement npm distribution first: `npx researchcrafters` or `npm create researchcrafters`.
- [x] Use OAuth device code flow for login.
- [x] Store auth token securely in local keychain or config fallback.
- [x] Refresh tokens transparently; prompt re-login when refresh fails.
- [ ] On `start`, resolve package version, entitlement, stage manifest, and
      signed starter URL.
      _(package version and stage resolve; signed starter URL is not returned.)_
- [ ] Download starter workspace.
      _(current workspace contains only `.researchcrafters/config.json` unless a
      future `starterUrl` is present.)_
- [x] Write `.researchcrafters/config.json`.
- [x] Show clear error UX for: not logged in, missing entitlement, fixture hash
      mismatch (package-author bug), runner offline, stage not unlocked.

## Submission Bundles

- [x] Define allowed workspace file patterns.
- [x] Exclude secrets, caches, virtualenvs, node_modules, and large binary files.
- [x] Enforce maximum upload size.
- [x] Enforce maximum file count.
- [x] Hash submission bundle.
- [x] Upload to signed object-storage URL.
- [x] Record submission metadata.
- [ ] Honor all API-returned `uploadHeaders` when uploading to the signed URL.
- [ ] Persist/display the `runId` returned by finalize so `status` and `logs`
      work without manual DB lookup.

## Runner Modes

- [x] Implement `test` mode. _(stubbed)_
- [x] Implement `replay` mode. _(stubbed)_
- [x] Implement CPU-only `mini_experiment` mode. _(stubbed)_
- [x] Reject GPU for MVP mini-experiments.
- [x] Validate `runner.yaml` schema.
- [x] Verify fixtures before execution using declared `sha256`.
- [x] Refuse execution on fixture hash mismatch.
- [ ] Enforce resource caps: CPU, memory, timeout, network. _(stubbed)_
- [ ] Disable outbound network by default. _(stubbed)_
- [x] Write raw artifacts to declared output paths.

## Execution Status

- [x] Return `execution_status=ok` on success.
- [x] Return `execution_status=timeout` on wall-clock timeout.
- [x] Return `execution_status=oom` on memory exhaustion.
- [x] Return `execution_status=crash` on sandbox/runtime crash.
- [x] Return `execution_status=exit_nonzero` on command failure.
- [x] Do not create a grade unless `execution_status=ok`.
- [x] Show retry UI for execution failures.
- [ ] Track abuse-control retry budget separately from graded attempts.

## Security

- [x] Treat all submissions as hostile.
- [ ] Run in isolated containers with cgroup limits. _(stubbed)_
- [ ] Use read-only base image plus writable workspace. _(stubbed)_
- [x] Strip secrets from runner environment.
- [x] Scrub logs before display.
- [ ] Store runner logs separately from application logs.
- [ ] Retain raw submission bundles for a short explicit window.
- [ ] Support user deletion of submissions.

## SLOs

- [ ] p95 `test` submission to grade visible under 30 seconds.
- [ ] p95 `replay` submission to grade visible under 60 seconds.
- [ ] p95 CPU-only `mini_experiment` result visible under 120 seconds.

## Acceptance Criteria

- [ ] Learner can start a package locally and submit code.
      _(start + submit round-trip, but starter workspace and run result loop are
      incomplete.)_
- [ ] Runner returns structured execution status and raw artifacts.
      _(runner unit tests cover statuses; finalized submissions remain queued in
      the integrated app.)_
- [ ] Evaluator receives artifacts only after successful execution.
      _(blocked until finalize enqueues runner jobs and callbacks persist
      artifacts/status.)_
- [x] Replay fixture hashes make cached-evidence stages reproducible.

## Open gaps from snapshot

- [ ] Land real Docker isolation (cgroup limits, network deny, secret stripping
      wired and tested) so `RUNNER_DOCKER_ENABLED=true` can run safely.
      _(LocalFsSandbox covers dev — `apps/runner/src/sandboxes/local-fs.ts`)_
- [ ] Wire `AnthropicGateway` to a real `ANTHROPIC_API_KEY` once a budget cap is
      in place.
- [ ] Plug BullMQ workers into a live Redis broker.
- [x] Replace the development-only device-code force-approve path with the real
      `/auth/device` browser approval flow.
- [ ] Enqueue `submission_run` from finalize and persist runner callback state
      (status, logs, metrics, timestamps).
- [ ] Return starter bundle URLs and smoke commands from enroll/start.
- [ ] Update CLI `submit` to persist `lastRunId` and pass signed upload headers.
- [ ] Evaluate gVisor / Modal / E2B integration once Docker isolation is solid.
- [ ] Publish CLI to npm with a release channel and versioning policy.
- [ ] Decide per-stage GPU policy beyond the MVP CPU-only stance.
