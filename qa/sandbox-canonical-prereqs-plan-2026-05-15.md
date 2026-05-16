# QA — Sandbox canonical prerequisites plan

Backlog item: `backlog/04-validation-evaluator.md:48` — "Confirm canonical
solution passes previous required stages."

## Scope

The bullet was marked `_(stubbed)_` and required the Docker-backed runner
(tracked separately under "Wire layer-3 sandbox execution to the real
runner once Docker is online"). Landing a deterministic, static portion
that the future executor can iterate keeps the bullet honest and gives
authors usable signal today.

This pass adds:

- `derivePrereqsPlans(loaded)` in
  `packages/content-sdk/src/validator/sandbox.ts` — walks the curriculum
  graph backwards over `unlocks` and `unlocks_by_choice`, maps graph node
  ids to stage ids via `loaded.stages[].data.id`, and filters to ancestors
  whose `runner.stages[stageId].mode !== 'none'`. Output is ordered by
  stage id.
- `validateSandbox` emits one `sandbox.canonical.prereqs.plan` info per
  runner-gated stage with the prerequisite list (or "no prior
  runner-gated stages.").
- `validateSandbox` emits a `sandbox.canonical.missing` warning when the
  package has runner-gated stages but `solutions/canonical/` is empty.

The Docker-execution portion (running the canonical workspace against
each prior required stage's runner command and asserting exit 0) remains
covered by the existing "Wire layer-3 sandbox execution" open gap.

## Commands run

```
pnpm --filter @researchcrafters/content-sdk build
pnpm --filter @researchcrafters/content-sdk test
pnpm --filter @researchcrafters/content-sdk lint
node -e "import('@researchcrafters/content-sdk').then(...)" \
    # spot-check on content/packages/resnet
```

## Results

- `pnpm --filter @researchcrafters/content-sdk test` — 28 / 28 pass (15
  validator tests, 13 leak-test tests). The three new tests cover:
  - sample-package: one runner-gated stage (S001), plan = `(none)`.
  - synthetic graph with `unlocks_by_choice` branching: confirms the
    sibling branch is excluded from a stage's ancestor list and that a
    `mode=none` middle stage is filtered out.
  - canonical-empty warning surfaces when `solutions.canonicalFiles` is
    cleared on a package that has runner-gated stages.
- Spot-check against `content/packages/resnet` returns the expected
  deterministic plan:
  - `S003` ← `(none)`
  - `S004` ← `S003`
- Lint is clean.
- Pre-existing `pedagogy.leak_test_failed` errors on resnet under the
  default mock gateway are unchanged by this work (they were already
  there before the edit; the CLI's `cleanRefusalGatewayFactory` is what
  the package CI uses to suppress them).

## Risks / follow-ups

- The plan is currently info-level — once the Docker runner pass lands,
  the same data should drive an error-level `sandbox.canonical.prereqs.fail`
  when the canonical command exits non-zero for a prerequisite stage.
- `derivePrereqsPlans` keys runner mode lookups off `loaded.runner.stages`
  with the stage id (`S00x`). Packages whose `workspace/runner.yaml`
  uses a different key shape will see those stages treated as
  `mode=none` (excluded). That matches the existing ARA cross-link /
  build behaviour, so no new contract is introduced.
