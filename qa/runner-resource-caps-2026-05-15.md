# QA: Runner resource caps + network default

Date: 2026-05-15
Scope: backlog/03-cli-runner.md :83 ("Enforce resource caps: CPU, memory, timeout, network")
       backlog/03-cli-runner.md :84 ("Disable outbound network by default")

## Change

- New module `apps/runner/src/limits.ts`:
  - `MODE_CAPS` — per-mode MVP ceilings (test/replay: 2 cpu, 2048MB, 60s;
    mini_experiment: 4 cpu, 4096MB, 120s; all 25MB upload cap).
  - `resolveStageLimits(mode, runnerStage, resources, requestedNetwork?)`
    clamps cpu/memory_mb/wall_clock_seconds to the mode cap, validates each
    requested value is a positive finite number (`ResourceLimitError`), and
    returns `network: 'none'`. Throws `NetworkPolicyNotSupportedError` if a
    caller hands in `'restricted'`.
- Refactored `modes/test.ts`, `modes/replay.ts`, `modes/mini-experiment.ts`
  to obtain `limits` from `resolveStageLimits` instead of passing the raw
  package-author-supplied numbers (or, in mini_experiment's case, a local
  ad-hoc clamp) through to the sandbox.
- Re-exported the new surface from `apps/runner/src/index.ts`.

## Why

Before this change `test` and `replay` modes forwarded
`runnerStage.cpu/memory_mb/wall_clock_seconds` (or the global resources
block) straight into the sandbox. A hostile package could request arbitrary
CPU, memory, or wall-clock budgets; only the dev-only `LocalFsSandbox`
hard-errored when its own ceilings were exceeded, and the production
`DockerSandbox` would silently honour whatever was requested once wired.
The bullet :84 default-egress posture was also only enforced ad-hoc — each
mode hard-coded `network: 'none'`, with no shared rejection if a caller
attempted to request egress.

Both bullets are now backed by a single resolver and pinned tests.

## Verification

`pnpm --filter @researchcrafters/runner typecheck` — clean.

`pnpm --filter @researchcrafters/runner test`:

```
 ✓ test/limits.test.ts (5 tests)
 ✓ test/security.test.ts (24 tests)
 ✓ test/replay-hash.test.ts (5 tests)
 ✓ test/local-fs.test.ts (13 tests)
 Test Files  4 passed (4)
      Tests  47 passed (47)
```

`test/limits.test.ts` covers:
- Fallback to global `resources` when stage-level overrides are absent.
- Clamp behaviour for `test`, `replay`, and `mini_experiment` modes when
  package-author values exceed the MVP ceilings.
- Rejection of zero, negative, and non-finite resource values.
- Default `network: 'none'` and rejection of `'restricted'` with
  `NetworkPolicyNotSupportedError`.

## Risks / Follow-ups

- Production `DockerSandbox` is still stubbed (backlog/03 :101–:102). When
  it lands, it must consume `ResolvedLimits` and translate `cpu` /
  `memoryMb` into cgroup limits; `network: 'none'` should map to
  `--network=none` (or equivalent namespace isolation).
- `RunJob` does not yet carry `runner.yaml`'s top-level `network` field.
  Once `DockerSandbox` is wired and an egress allowlist exists, plumb the
  requested policy through and let `resolveStageLimits` honour
  `'restricted'`.
- Mini-experiment's `MiniExperimentResourceError` LocalFs guard is
  retained as defence in depth; it can be removed once `LocalFsSandbox`
  ceilings match the mode cap.
