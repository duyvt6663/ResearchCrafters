# QA — Sandbox runner output paths verification (static plan)

Backlog item: `backlog/04-validation-evaluator.md:50` — "Verify runner
output paths are produced." (Sandbox Validation).

## Scope

The bullet was marked `_(stubbed)_` because the Docker-backed runner is
not yet online (tracked separately under "Wire layer-3 sandbox execution
to the real runner once Docker is online"). Landing the deterministic
static portion now keeps the bullet honest and gives authors usable
signal today, in the same shape as the existing
`sandbox.canonical.prereqs.plan` pass.

This pass adds three new sandbox-layer issues, all driven from
`workspace/runner.yaml` `stages[*].output_paths`:

- `sandbox.output_paths.plan` (info, per runner-gated stage with at
  least one valid `output_paths` entry): lists the normalized,
  workspace-relative paths the future executor will assert were
  produced for that stage's runner command.
- `sandbox.output_paths.missing` (warning, per runner-gated stage with
  no declared outputs): flags stages where the executor will have
  nothing to assert was produced, so authors notice the gap before the
  runner lands.
- `sandbox.output_paths.invalid` (error, per offending entry): rejects
  absolute paths and entries that escape the package root with `..`,
  since both would bypass the workspace boundary the runner enforces.

The Docker-execution portion (running the runner command, then
asserting each `output_paths` entry exists with non-zero size) remains
covered by the existing open gap.

## Files touched

- `packages/content-sdk/src/validator/sandbox.ts` — emits the three
  new codes from the existing per-stage plan loop.
- `packages/content-sdk/test/validator.test.ts` — three new tests:
  - sample-package: `S001` (mode=replay, output `workspace/out/s001.json`)
    surfaces a `sandbox.output_paths.plan` with the path in the message
    and no `output_paths.missing` warning.
  - sample-package with `S001.output_paths` removed: warns
    `sandbox.output_paths.missing` and emits no plan info.
  - sample-package with mixed entries (`/etc/passwd`, `../escape.json`,
    `workspace/out/ok.json`): emits two
    `sandbox.output_paths.invalid` errors and a plan info that still
    contains the surviving relative path.

## Commands run

```
pnpm --filter @researchcrafters/content-sdk build
pnpm --filter @researchcrafters/content-sdk test
pnpm --filter @researchcrafters/content-sdk lint
```

## Results

- `pnpm --filter @researchcrafters/content-sdk test` — 31 / 31 pass
  (18 validator tests, 13 leak-test tests). New tests cover the plan,
  missing-warning, and invalid-entry paths described above.
- `pnpm --filter @researchcrafters/content-sdk build` — clean.
- `pnpm --filter @researchcrafters/content-sdk lint` — clean.

## Risks / follow-ups

- Plan info is currently surfaced via message text only (the issues
  helper accepts `{ path, ref, pending }`); the future
  Docker-backed executor will lift the same list off
  `loaded.runner.stages[stageId].output_paths` directly, so no payload
  change is required to wire the assertion later.
- Tracked but out of scope here:
  - Wire layer-3 sandbox execution to the real runner once Docker is
    online (will turn the warning + plan into a real produced-paths
    assertion that errors `sandbox.output_paths.not_produced` per
    missing file).
  - Plug leak-tests and non-stub sandbox validation into the same
    package CI gate.
