# QA: per-package mentor refusal copy

- **Backlog item:** `backlog/05-mentor-safety.md:25` — _Author refusal copy per
  package; do not let the model generate refusals._
- **Source workflow item:** skynet backlog `f507f346-6c89-46a7-8af5-41106e6790f0`
- **Date:** 2026-05-16
- **Author:** skynet-backlog-iterator

## Scope tested

1. New `package.safety.mentor_refusals` block on `safetySchema`
   (`packages/erp-schema/src/schemas/package.ts`) — an optional record from
   mentor refusal scope to `{ title, body, hint? }`.
2. Replacement of the stubbed `getAuthoredRefusal` in
   `packages/ai/src/refusal.ts` with a real resolver that:
   - ships non-placeholder platform defaults aligned with the React-free
     copy in `@researchcrafters/ui/copy`,
   - accepts per-package authored overrides and applies them with strict
     precedence over the platform defaults,
   - personalises the platform-default `body` text with a `packageTitle`
     when provided.
3. Concrete authored copy added under
   `content/packages/resnet/package.yaml` for the scopes that benefit from
   package-specific wording (`solution_request`, `out_of_context`,
   `policy_block`, `flagged_output`, `budget_cap`, `rate_limit`).
4. Out of scope: wiring the runtime to load the package safety block from
   the `PackageVersion.manifest` JSON and to call the new resolver — that
   stays as the existing "wire production" gap in backlog/05. The model is
   still never permitted to write refusals: `mentor-runtime.ts` continues
   to substitute the authored copy from `mentorRefusal({ scope: ... })`
   for flagged outputs, and the new ai-package resolver is the canonical
   server-side path for any code that needs per-package authoring.

## Commands run

```sh
pnpm --filter @researchcrafters/ai test                # 29/29 pass (incl. 7 new refusal tests)
pnpm --filter @researchcrafters/erp-schema test        # 47/47 pass
pnpm --filter @researchcrafters/content-sdk test       # 37/37 pass
pnpm --filter @researchcrafters/cli build              # ok
node packages/cli/bin/researchcrafters.js validate ./content/packages/resnet
```

The CLI validate run reports the same 9 pre-existing
`pedagogy.grader_adversarial_failed` errors that are present on the branch
baseline (verified by `git stash` of `content/packages/resnet/package.yaml`
and re-running validate). The new `mentor_refusals` block introduces no
additional validation errors or warnings.

## Result

PASS. The bullet at `backlog/05-mentor-safety.md:25` is now backed by:

- schema + types exposing per-package authoring,
- a tested resolver that never asks the model for refusal copy, and
- concrete authored copy for the ResNet content package.

## Residual risks

- The mentor runtime still calls `mentorRefusal({ scope: ... })` from
  `@researchcrafters/ui/copy` for its single in-process refusal path
  (`flagged_output`). The new `getAuthoredRefusal` is API-equivalent for
  that scope when no overrides are supplied, but plumbing
  `PackageVersion.manifest.safety.mentor_refusals` into the runtime so the
  resnet overrides actually reach learners is left for the existing
  "Wire production" follow-up bullet in backlog/05 Open Gaps.
- Parity between the ai-package platform defaults and the UI-package
  authored copy is enforced today by inspection only. If a future change
  edits one, drift will not be caught automatically; a cross-package
  parity test could be added once the runtime is fully wired to a single
  source of truth.
