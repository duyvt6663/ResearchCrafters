# CLI and Runner TODO

Goal: support local-first CodeCrafters-style work for code and experiment stages.

Depends on: 08 (auth, signed URLs, runner base images). Used by: 01, 04.

## CLI Surface

The same binary hosts learner and author subcommands. Subcommand groups gate
behavior by the user's role and entitlement.

Learner commands:

- [ ] `researchcrafters login` (OAuth device code flow).
- [ ] `researchcrafters logout` (revoke and clear local token).
- [ ] `researchcrafters start <package>`.
- [ ] `researchcrafters test` (local smoke tests).
- [ ] `researchcrafters submit` (bundle and upload).
- [ ] `researchcrafters status` (current stage + last run).
- [ ] `researchcrafters logs <run-id>` (stream or poll run logs).

Author commands (cross-reference 04):

- [ ] `researchcrafters validate <package-path>` (layers 1-4).
- [ ] `researchcrafters preview <package-path>` (open the local package in the
      preview environment).
- [ ] `researchcrafters build <package-path>` (compile indexes and prepare upload).

Common:

- [ ] `researchcrafters --version` and version-mismatch warning when the local
      CLI is older than the server expects.
- [ ] Shell completion for bash, zsh, and fish.

## CLI Foundations

- [ ] Decide CLI package name and distribution path.
- [ ] Implement npm distribution first: `npx researchcrafters` or `npm create researchcrafters`.
- [ ] Use OAuth device code flow for login.
- [ ] Store auth token securely in local keychain or config fallback.
- [ ] Refresh tokens transparently; prompt re-login when refresh fails.
- [ ] On `start`, resolve package version, entitlement, stage manifest, and signed
      starter URL.
- [ ] Download starter workspace.
- [ ] Write `.researchcrafters/config.json`.
- [ ] Show clear error UX for: not logged in, missing entitlement, fixture hash
      mismatch (package-author bug), runner offline, stage not unlocked.

## Submission Bundles

- [ ] Define allowed workspace file patterns.
- [ ] Exclude secrets, caches, virtualenvs, node_modules, and large binary files.
- [ ] Enforce maximum upload size.
- [ ] Enforce maximum file count.
- [ ] Hash submission bundle.
- [ ] Upload to signed object-storage URL.
- [ ] Record submission metadata.

## Runner Modes

- [ ] Implement `test` mode.
- [ ] Implement `replay` mode.
- [ ] Implement CPU-only `mini_experiment` mode.
- [ ] Reject GPU for MVP mini-experiments.
- [ ] Validate `runner.yaml` schema.
- [ ] Verify fixtures before execution using declared `sha256`.
- [ ] Refuse execution on fixture hash mismatch.
- [ ] Enforce resource caps: CPU, memory, timeout, network.
- [ ] Disable outbound network by default.
- [ ] Write raw artifacts to declared output paths.

## Execution Status

- [ ] Return `execution_status=ok` on success.
- [ ] Return `execution_status=timeout` on wall-clock timeout.
- [ ] Return `execution_status=oom` on memory exhaustion.
- [ ] Return `execution_status=crash` on sandbox/runtime crash.
- [ ] Return `execution_status=exit_nonzero` on command failure.
- [ ] Do not create a grade unless `execution_status=ok`.
- [ ] Show retry UI for execution failures.
- [ ] Track abuse-control retry budget separately from graded attempts.

## Security

- [ ] Treat all submissions as hostile.
- [ ] Run in isolated containers with cgroup limits.
- [ ] Use read-only base image plus writable workspace.
- [ ] Strip secrets from runner environment.
- [ ] Scrub logs before display.
- [ ] Store runner logs separately from application logs.
- [ ] Retain raw submission bundles for a short explicit window.
- [ ] Support user deletion of submissions.

## SLOs

- [ ] p95 `test` submission to grade visible under 30 seconds.
- [ ] p95 `replay` submission to grade visible under 60 seconds.
- [ ] p95 CPU-only `mini_experiment` result visible under 120 seconds.

## Acceptance Criteria

- [ ] Learner can start a package locally and submit code.
- [ ] Runner returns structured execution status and raw artifacts.
- [ ] Evaluator receives artifacts only after successful execution.
- [ ] Replay fixture hashes make cached-evidence stages reproducible.
