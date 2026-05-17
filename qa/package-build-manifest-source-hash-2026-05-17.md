# QA: Store source hash and package build manifest

- Backlog item: `backlog/06-data-access-analytics.md` — Data, Access, and
  Analytics Backlog > Package Build Mirroring: "Store source hash and package
  build manifest."
- Skynet item id: `70f505ec-eceb-4541-89ce-9701a045ce3f`
- Branch: `skynet/pr/package-build-manifest-source-hash-2026-05-17`
- Date: 2026-05-17

## Scope tested

The schema already declares `PackageVersion.sourceHash` and
`PackageVersion.manifest`, and the DB seed mirrors them; what was missing was
a single canonical source-hash algorithm shared between the build CLI artifact
and the DB mirror step, plus a build-time emission so a publisher tool can
pin the hash without recomputing it.

This change:

1. Adds `computeManifestSourceHash(manifest)` to
   `@researchcrafters/content-sdk` (`packages/content-sdk/src/source-hash.ts`)
   using deterministic key-sorted JSON serialization + sha256.
2. Updates `researchcrafters build` to write `manifest.json` **and**
   `source-hash.txt` to the build output, and to return the hash on the
   `BuildArtifacts` result.
3. Replaces the local `stableHash` helper in `packages/db/src/seed.ts` with
   the shared content-sdk helper, so the seeded
   `PackageVersion.sourceHash` is guaranteed to match the hash file the
   build CLI emits for the same manifest.

## Commands run

From `.skynet-wt/build-manifest/`:

- `pnpm --filter @researchcrafters/content-sdk test` →
  `Test Files 3 passed (3), Tests 45 passed (45)`
  (includes new `test/source-hash.test.ts`, 4 tests).
- `pnpm --filter @researchcrafters/cli test -- build` →
  `Test Files 1 passed (1), Tests 3 passed (3)`
  (new `test/build.test.ts`).
- `node_modules/.bin/tsc --noEmit src/seed.ts` (in `packages/db`) — no errors
  on the new `computeManifestSourceHash` import. Pre-existing errors at
  lines 476+ for `stage_subtype` / `writing_constraints` / `citation_policy`
  / `reviewer_prompt` / `revision` are present on `origin/main` HEAD and
  are unrelated to this change (they belong to other in-flight backlog
  work that has not yet landed the matching schema updates).
- `pnpm --filter @researchcrafters/db test` →
  `Test Files 1 passed (1), Tests 12 passed | 1 skipped (13)`.

## Result

PASS — all focused tests green. The new source-hash artifact is emitted by
the build CLI and matches the hash the DB seed writes into
`PackageVersion.sourceHash`.

## Residual risks

- The pre-existing typecheck errors in `validator/pedagogy.ts` and the
  later half of `seed.ts` are a baseline state on `origin/main` and will
  resolve when their owning backlog items land. They are not introduced
  by this change.
- Sample-package fixture currently fails the pedagogy leak-test layer of
  `validatePackage`, which is why the new CLI build test stubs
  `validatePackage`. That fixture/validator drift is tracked separately
  by the leak-test work; this change does not depend on it.
- Patches (`PackageVersionPatch.overlays`) intentionally do not feed into
  the source hash — the hash pins the canonical build manifest only,
  consistent with the existing seed behavior.
