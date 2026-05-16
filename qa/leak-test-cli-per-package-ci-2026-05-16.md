# QA — Mentor leak-test battery wired into per-package CI

- **Backlog item:** `backlog/04-validation-evaluator.md:194` — *Plug the mentor
  leak-test battery from `packages/ai` into per-package CI.*
- **Skynet item ID:** `b50a5cbc-947e-4c91-8bb8-f0d04c15856d`
- **Branch:** `skynet/pr/evaluator-reviewer-grade-override-2026-05-16` (worktree
  inherited from prior backlog claim)
- **Date:** 2026-05-16

## Scope

Add a dedicated CLI entry point that runs the mentor leak-test battery from
`packages/ai` (via the SDK harness `runStageLeakTests`) against every stage of
an ERP package, and gate per-package CI on it.

Files changed:

- `packages/cli/src/commands/leak-test.ts` (new) — wraps `loadPackage`,
  `collectStageRedactionTargets`, and `runStageLeakTests`; supports three
  gateway choices: `clean-refusal` (default, mock), `sdk-default` (worst-case
  mock that echoes redaction targets — regression of the harness), and
  `anthropic` (real `AnthropicGateway`, requires `ANTHROPIC_API_KEY`).
- `packages/cli/src/index.ts` — registers `researchcrafters leak-test <pkg>`
  with `--gateway` and `--json` flags.
- `packages/cli/test/leak-test.test.ts` (new) — three vitest cases.
- `.github/workflows/ci.yml` — new "Leak-test ERP packages" step after the
  existing validate loop. Auto-selects `anthropic` gateway when
  `secrets.ANTHROPIC_API_KEY` is present, else `clean-refusal`.

The validator already invoked `runStageLeakTests` inside `validatePackage` via
`pedagogy.ts`, but only with the validate command's mock gateway. The new CLI
subcommand makes the gate explicit, swappable, and pluggable for the real
Anthropic gateway in CI — without disturbing `validate`'s author-facing
behaviour.

## Verification

Commands run locally from repo root:

1. `cd packages/cli && pnpm typecheck` — clean.
2. `cd packages/cli && pnpm lint` — clean.
3. `cd packages/cli && pnpm test` — 10 suites, 67 tests pass (includes the
   3 new `leak-test.test.ts` cases).
4. `cd packages/cli && pnpm build` — clean tsc build.
5. End-to-end on the real `content/packages/resnet` package:
   - `pnpm --filter @researchcrafters/cli exec node ./bin/researchcrafters.js leak-test "$(realpath content/packages/resnet)" --gateway clean-refusal`
     → PASS for all 10 stages (S001, S001M, S002, S003, S004, S005, S006, S007,
     S007R, S008), 7–8 attacks per stage, exit 0.
   - Same command with `--gateway sdk-default` → FAIL for every stage (each
     reports `direct-ask` echoing `F(x) + x`), exit 1. Confirms the harness
     detects leaks and the CLI propagates non-zero exit.

## Gateway behaviour summary

| Gateway          | Behaviour                                                                 | When CI uses it                            |
|------------------|---------------------------------------------------------------------------|--------------------------------------------|
| `clean-refusal`  | Mock that always refuses with neutral copy; never matches a target.       | PRs without `ANTHROPIC_API_KEY` (default). |
| `sdk-default`    | SDK regression mock; echoes the first target on `direct-ask`.             | Local diagnostic only.                     |
| `anthropic`      | Real `AnthropicGateway`; throws unless `ANTHROPIC_API_KEY` is set.        | PRs with the secret available.             |

## Residual risks

- Forks PRs and contributors without `ANTHROPIC_API_KEY` exercise only the
  clean-refusal mock, so the CI gate proves wiring and harness composition
  (DEFAULT_ATTACKS UNION authored battery) but does not exercise model
  behaviour. The protected-branch run with the secret will catch real-model
  regressions.
- The leak-test step runs sequentially per package (single CI shell loop).
  With one package today (`resnet`) this is trivial; if package count grows
  past ~10, consider a matrix split.
- `validate` still invokes `runStageLeakTests` independently with a different
  default mock. That is intentional (author-facing speed and determinism) but
  means the leak path is exercised twice in CI. Acceptable churn vs. ripping
  out the existing pedagogy hook.

## Result

PASS — wiring landed, gates green on the real package, harness regression
confirmed via sdk-default. Marking backlog item complete.
