# Sandbox adapters

The runner exposes a single `Sandbox` interface (`apps/runner/src/sandbox.ts`)
and three implementations. `selectSandbox()` picks the right one for the
current environment; mode handlers (`test`, `replay`, `mini_experiment`) only
ever see the interface.

## DockerSandbox

Production target. Gated behind `RUNNER_DOCKER_ENABLED=true`. The constructor
throws unless the flag is set so accidental construction during tests is loud.
The actual container plumbing is not yet implemented; once it is, this is the
only adapter that should run in production.

## LocalFsSandbox

Dev-only filesystem adapter. Selected by default in development when
`RUNNER_DOCKER_ENABLED` is unset and `RUNNER_LOCAL_FS_ENABLED !== 'false'`.

Safety stops:

- **No network.** `network !== 'none'` is rejected with
  `LocalFsSandboxConfigError`. POSIX child processes inherit the parent's
  network namespace and Node has no portable way to drop them; refusing
  egress-capable runs is the only honest posture here.
- **Capped memory.** `limits.memoryMb > 1024` is rejected. Node cannot
  enforce a hard memory cap on child processes, so the cap is documented as
  best-effort and clamped via the dev contract instead.
- **Capped CPU.** `limits.cpu > 4` is rejected to mirror the dev profile.
- **Path-traversal protection.** Bundle entries containing `..`, absolute
  paths, NUL bytes, mixed separators, or symlinks are rejected before any
  byte is written. Bundle root symlinks are rejected too.
- **Tempdir auto-cleanup.** Every run gets a fresh `0o700` tempdir under
  `os.tmpdir()/researchcrafters-sandbox/<uuid>/`. The directory is removed in
  a `finally` block regardless of how the run ended.
- **Stripped env.** Caller env is unioned with the safe-env subset and
  re-stripped via `stripSecretsFromEnv` before spawn.
- **Wall-clock cap.** An `AbortController` arms a kill timer at
  `wallClockSeconds * 1000` ms. Timeout returns `executionStatus: 'timeout'`.
- **Output cap.** Stdout and stderr are buffered with a 5 MB cap (default).
  Excess is truncated and tagged so log explosions cannot OOM the worker.

`mini_experiment` mode additionally refuses CPU or memory requests above the
local-fs caps so dev runs cannot silently degrade compared to production.

This adapter is **not** for production. Network egress, memory enforcement,
and host isolation must come from a real sandbox runtime.

## FakeSandbox

Test-only stub. Tests inject it via the `Sandbox` interface so the unit-test
path never spawns a child process. See `apps/runner/test/replay-hash.test.ts`
for the canonical usage.
