# QA — Cosmetic overlay contract for PackageVersionPatch (backlog/06 §Version and Patch Policy)

- **Backlog item:** `backlog/06-data-access-analytics.md:68` — "Allow only cosmetic overlays for patches."
- **Item id:** `1c3f2651-9229-42f0-a664-e77c9fe1a7b4`
- **Date:** 2026-05-17
- **Branch at start:** `skynet/pr/mentor-cache-stage-static-context-2026-05-16` (dirty worktree owned by another in-flight PR; this iteration's edits are scoped to two new files + one tightly-scoped index re-export)

## Scope

Lock down the contract for `PackageVersionPatch.overlays` (the existing `Json`
column on `packages/db/prisma/schema.prisma:280`). Anything that touches graph
topology, stage_policy, rubric, runner, branch definitions, or canonical
solutions must require a new package version (backlog/06 line 70) — patches
themselves must be cosmetic only.

Related backlog lines (69–73) are intentionally **not** claimed: each requires
non-overlapping plumbing (StageAttempt schema migration for line 69; manifest
diff validator for line 70; migration UX surface for lines 71–73). Bundling
them would have made the change unfocused.

## Change set

- `packages/erp-schema/src/schemas/patch.ts` — strict `patchOverlaySchema`
  (and `patchPackageOverlaySchema`, `patchStageOverlaySchema`) defining the
  closed cosmetic vocabulary, plus `validatePatchOverlay(input)` returning a
  `{ valid, errors, data }` result with JSON-path-prefixed error strings.
  Empty payloads are accepted so authors can stage scaffolds; empty strings
  and negative `estimated_time_minutes` are rejected to catch accidental
  clearing.
- `packages/erp-schema/src/schemas/index.ts` — re-export the new schemas,
  helper, and inferred types.
- `packages/erp-schema/test/patch.test.ts` — 13 cases covering the accept
  surface (empty / package-only / stage-only / full) and the reject surface
  (unknown top-level keys, structural fields hidden inside `stages.*`,
  `rubric`, `runner`, `branches`, `solution`, `stage_policy`-under-stage,
  empty-string copy, negative numbers, and that error strings carry the JSON
  path so authoring tools can point to the offending key).

## Commands

```
pnpm --filter @researchcrafters/erp-schema test
```

Result: **63 passed** (50 pre-existing + 13 new), 0 failed.

```
cd packages/erp-schema && pnpm tsc --noEmit
```

Result: one pre-existing error in `src/schemas/trace.ts` (untracked, not part
of this change — verified via `git status --short`). All new files type-check
cleanly; `trace.ts` is unreferenced by the new patch surface.

## Residual risks / follow-ups

- **No consumer yet.** Nothing currently writes `PackageVersionPatch` rows, so
  this iteration forward-defines the contract. When a patch-authoring CLI or
  API surface lands, it must call `validatePatchOverlay` before insert; the
  contract is exported from `@researchcrafters/erp-schema` for that use.
- **Line 70 ("Require new package version for graph/stage/rubric/runner/
  solution changes") remains open** and will reuse this schema's complement —
  any diff that lands outside the cosmetic surface implies a version bump.
- **`paper` metadata is excluded** from the cosmetic surface. Author errata
  (e.g. fixing an arXiv id typo) currently still require a version bump; if
  authoring feedback says that is too heavy, `paper.title`/`paper.arxiv` are
  the natural next cosmetic addition.
- Did **not** touch the migration UX backlog items (71–73) or the
  StageAttempt `patchSeq` runtime plumbing (item 69) — those are separate
  iterations.

## Verdict

Pass. Contract is enforced, focused tests cover the accept and reject
surfaces, no pre-existing tests regressed.
