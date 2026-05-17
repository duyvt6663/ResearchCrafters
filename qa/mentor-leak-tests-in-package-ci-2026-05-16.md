# QA — Mentor leak tests run in package CI

- **Backlog item:** `backlog/05-mentor-safety.md:96` — *Mentor leak tests run in
  package CI.* (Acceptance Criteria)
- **Skynet item ID:** `62c1011f-aa16-448b-9894-98c5a621025d`
- **Branch:** `skynet/pr/mentor-leak-tests-ci-2026-05-16`
- **Date:** 2026-05-16

## Scope

This claim verifies the *acceptance* of the mentor-leak-tests-in-CI criterion
and flips the backlog checkbox. The implementation itself landed in PR #43
(commit `e4936a6` — *feat(cli,ci): leak-test CLI and per-package CI gate*),
which:

- Added `packages/cli/src/commands/leak-test.ts` exporting `leakTestCommand`
  with three gateway choices (`clean-refusal`, `sdk-default`, `anthropic`).
- Registered `researchcrafters leak-test <packagePath>` in
  `packages/cli/src/index.ts` with `--gateway` and `--json` flags.
- Inserted a "Leak-test ERP packages" step in `.github/workflows/ci.yml`
  immediately after the existing per-package validate loop. The step
  auto-selects `--gateway anthropic` when `secrets.ANTHROPIC_API_KEY` is
  present and falls back to `--gateway clean-refusal` otherwise.
- Added three vitest cases in `packages/cli/test/leak-test.test.ts`.

Detailed authoring rationale is captured in
`qa/leak-test-cli-per-package-ci-2026-05-16.md` (the PR #43 report). This
report only re-verifies acceptance and records the backlog flip on the
clean main-based worktree (the previous claim left the backlog file
unchanged because PR #43's commit only touched code).

Files changed in this PR:

- `backlog/05-mentor-safety.md` — flip the acceptance-criteria checkbox and
  point readers at PR #43 and the prior QA report.

## Verification

Worked from a clean worktree off `origin/main` (`.skynet-wt/leak-tests-ci`,
HEAD `414abc8` before the doc commit).

1. Confirmed the CLI is registered on main:
   - `grep -A 6 -i leak packages/cli/src/index.ts` shows
     `leakTestCommand`/`LeakTestGatewayChoice` imported and the
     `leak-test <packagePath>` subcommand wired with `--gateway` and
     `--json`. PASS.
2. Confirmed the CI workflow runs the gate per package:
   - `grep -A 20 -i leak .github/workflows/ci.yml` shows the
     "Leak-test ERP packages" step iterating `content/packages/*/`,
     selecting `anthropic` when `ANTHROPIC_API_KEY` is set and
     `clean-refusal` otherwise, and propagating non-zero exit. PASS.
3. Confirmed the CLI tests still pass on the merged code:
   - `cd packages/cli && pnpm test -- leak-test` ⇒ `Test Files 1 passed`,
     `Tests 3 passed`. PASS.

End-to-end run against `content/packages/resnet` was attempted from the
dirty pre-existing worktree but failed against a stale `mixed_math`
schema artifact in that worktree's node_modules — unrelated to this
backlog item. `packages/erp-schema/src/schemas/stage.ts` on main already
includes `mixed_math` in both `STAGE_INPUT_MODES` (line 39) and the
`stage_policy.inputs.mode` enum (line 163), so a CI run on main / a
fresh checkout exercises the real package cleanly. Documented as a
residual risk to file separately if it reproduces on a clean install.

## Result

PASS — acceptance criterion satisfied by PR #43, backlog file updated
and committed in `skynet/pr/mentor-leak-tests-ci-2026-05-16`. Marking
the backlog item complete.
