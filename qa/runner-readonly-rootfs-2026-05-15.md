# Runner: read-only rootfs + writable workspace contract

**Backlog item:** `backlog/03-cli-runner.md:102` — "Use read-only base image
plus writable workspace." (Security)

**Skynet item id:** `70c67776-f87e-4cdf-870e-8b49edc4216d`

**Date:** 2026-05-15

## Scope

Lock down the sandbox contract that the runner uses to enforce the
read-only base image + writable workspace posture, so neither the dev
adapter nor a future Docker wiring can silently weaken it. The actual
`docker run --read-only` invocation lives with the rest of the dockerode
integration in `backlog/08-infra-foundations.md`; this iteration owns the
contract layer and its tests.

## Out of scope

- `DockerSandbox.run` body itself (still scaffolded; pulled forward only the
  policy guard so the future wiring cannot regress the contract by accident).
- Runner-log separation, submission-bundle retention windows, user-deletion
  flow, and the `test`/`replay` SLO bullets — these were listed as related
  items by the queue but are independent concerns and were not claimed.

## Changes

| Path | Change |
| --- | --- |
| `apps/runner/src/sandboxes/local-fs.ts` | `LocalFsSandbox.run` now refuses `readOnlyRootfs: false` with a `LocalFsSandboxConfigError`; doc-comment updated. |
| `apps/runner/src/sandbox.ts` | `DockerSandbox.run` now refuses `readOnlyRootfs: false` *before* throwing the not-yet-implemented error, so the future dockerode wiring inherits the guard. |
| `apps/runner/test/local-fs.test.ts` | Added LocalFsSandbox refusal test for `readOnlyRootfs: false`. |
| `apps/runner/test/read-only-rootfs.test.ts` | New file: 6 tests asserting (a) `sanitizeRunOpts` defaults the flag to `true`, (b) explicit `true` is preserved, (c) explicit `false` is *not* silently flipped (so the sandbox can refuse it), (d/e/f) all three modes (`test`, `replay`, `mini_experiment`) hand `readOnlyRootfs: true` and `network: 'none'` to the sandbox via a `FakeSandbox` capture. |
| `apps/runner/docker/{test,replay,mini-experiment}.Dockerfile` | Comments updated: image is shaped for the posture (non-root `sandbox` user, `/workspace` is the only writable path); the runtime `--read-only` + writable bind mount is gated by `readOnlyRootfs` and issued by `DockerSandbox.run` once dockerode wiring lands in `backlog/08`. |
| `backlog/03-cli-runner.md:102` | Bullet flipped from `[ ] _(stubbed)_` to `[x]` with an inline note pointing at the contract surface and at `backlog/08` for the dockerode wiring. |

The contract is now defended at three layers:

1. `sanitizeRunOpts` defaults `readOnlyRootfs` to `true` for any caller that
   omits it (existing behaviour, now covered by a test).
2. All three mode handlers pass it explicitly (`runTestMode`,
   `runReplayMode`, `runMiniExperimentMode`), now covered by an end-to-end
   `FakeSandbox`-capture test.
3. Both sandbox implementations (`LocalFsSandbox`, `DockerSandbox`) refuse
   the explicit `false` opt-out before doing any work, so a future regression
   that bypasses the modes still cannot land a writable rootfs without
   hitting a typed error.

## Verification

```
pnpm --filter @researchcrafters/runner test
# Test Files  5 passed (5)
# Tests       54 passed (54)
#   incl. test/read-only-rootfs.test.ts (6 tests)
#   incl. test/local-fs.test.ts > "refuses readOnlyRootfs=false"

pnpm --filter @researchcrafters/runner build
# clean tsc — no type errors
```

## Follow-ups

- `backlog/08-infra-foundations.md`: when `DockerSandbox.run` is wired up,
  translate `readOnlyRootfs !== false` to the dockerode equivalents
  (`HostConfig.ReadonlyRootfs: true`, `--tmpfs /tmp`, writable bind mount at
  `workspacePath`). The guard added in this iteration ensures that wiring
  cannot ship without honouring the contract.
- Related-but-not-claimed bullets `backlog/03-cli-runner.md:105-107,
  111-112` remain pending in the queue and are appropriate for separate
  iterations.
