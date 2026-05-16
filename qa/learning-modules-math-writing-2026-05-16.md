# QA: Interactive Math and Academic Writing Modules

- **Backlog item:** `backlog/11-learning-modules-math-writing.md`
- **Branch:** `skynet/pr/learning-modules-math-writing-2026-05-16`
- **Date:** 2026-05-16
- **Result:** PASS with existing pending sandbox warnings

## Scope Tested

Implemented and verified the first launchable slice of interactive math and
academic-writing modules:

- Stage schema support for `stage_subtype`, structured math input modes,
  `inputs.answer_schema`, per-step hints/feedback, accepted symbolic forms,
  writing constraints, citation policy, reviewer prompt, and revision metadata.
- ResNet `S001M` upgraded to a derivation scaffold with identity target,
  shortcut-gradient step, and a wrong-mechanism repair prompt.
- ResNet `S006` upgraded to claim surgery plus evidence ladder.
- ResNet `S007R` reframed as the requested vanishing-gradients reviewer
  rebuttal using allowed ResNet evidence.
- Pedagogy validator checks for grounded, structured math modules.
- Evaluator deterministic derivation checker for accepted equivalent forms and
  per-step partial credit.
- Writing evaluator regressions for strong, weak, overclaiming, and
  citation-missing ResNet examples.
- Web/UI evidence plumbing so writing workbenches get verified stage evidence.

## Commands Run

```sh
pnpm install --frozen-lockfile
pnpm --filter @researchcrafters/cli... build
pnpm --filter @researchcrafters/db build
pnpm --filter @researchcrafters/ui build
pnpm --filter @researchcrafters/evaluator-sdk build
pnpm --filter @researchcrafters/telemetry build
pnpm --filter @researchcrafters/worker build
pnpm --filter @researchcrafters/web typecheck
pnpm --filter @researchcrafters/erp-schema test
pnpm --filter @researchcrafters/ui test
pnpm --filter @researchcrafters/evaluator-sdk test
pnpm --filter @researchcrafters/content-sdk test
pnpm --filter @researchcrafters/web test -- lib/__tests__/data/enrollment.test.ts
node packages/cli/bin/researchcrafters.js validate content/packages/resnet
git diff --check -- .
```

Notes:

- Initial `vitest --runInBand` attempts failed because Vitest does not support
  that Jest flag; the native package test commands passed.
- Initial `web typecheck` and package tests that import workspace entrypoints
  needed local `dist/` builds first; reruns after building dependencies passed.

## Results

- `@researchcrafters/erp-schema` tests: 50 passed.
- `@researchcrafters/ui` tests: 79 passed.
- `@researchcrafters/evaluator-sdk` tests: 115 passed.
- `@researchcrafters/content-sdk` tests: 41 passed.
- Focused web enrollment data test: 12 passed.
- ResNet package validation: 0 errors, 2 warnings, 13 info.
- Whitespace check: passed.

## Remaining Risks

- Package validation still reports the pre-existing pending sandbox warnings
  for missing `output_paths` on runner-gated stages `S003` and `S004`.
- `ClaimEvidenceMatrix`, `RevisionDiff`, `ReviewerPanel`, writing evaluator
  metadata, and mentor-specific editor behavior remain open backlog items.
- The deterministic derivation checker is intentionally lightweight string
  normalization over authored accepted forms; full symbolic equivalence remains
  deferred until usage proves it is needed.
