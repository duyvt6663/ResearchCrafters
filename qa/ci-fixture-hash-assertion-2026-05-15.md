# QA — CI assertion for recorded fixture hashes

- Backlog item: `backlog/02-erp-content-package.md:90` — "Add a CI assertion that recorded hashes match the files committed."
- Date: 2026-05-15
- Branch: skynet/pr/landing-sample-decision-2026-05-15
- Status: ready for QA

## What changed

- Added `scripts/verify-fixture-hashes.mjs` — a zero-dependency Node script
  that walks `content/packages/*/workspace/runner.yaml`, extracts each
  declared `{ path, sha256 }` fixture, and asserts the recorded sha256
  matches the file currently on disk. Exits non-zero on any missing file
  or hash mismatch.
- Wired it into `.github/workflows/ci.yml` as a new "Verify ERP fixture
  hashes" step that runs before `pnpm install`. Placing it early gives a
  clear, cheap failure signal — no dependency install or build needed for
  the assertion to fire.
- Marked the backlog checkbox done.

## Why not rely solely on the existing validator

The content-SDK validator (`packages/content-sdk/src/validator/sandbox.ts`)
already produces a `fixture.hash_mismatch` error, and the CI workflow does
run `researchcrafters validate` per package. That assertion is therefore
already enforced *transitively*. The new step makes the assertion explicit
and fast:

- runs in seconds with no pnpm install, no Prisma generate, no Playwright;
- has clear failure attribution (the step name says exactly what failed);
- survives future refactors of the broader validator (e.g. if hash
  checking is ever moved or weakened in the SDK, this stays put).

The full validator step is unchanged and remains the canonical check; the
new step is a focused tripwire in front of it.

## Verification

Run locally from repo root:

```
node scripts/verify-fixture-hashes.mjs
```

Observed outcomes (positive, mismatch, missing) on this branch:

1. **Happy path** — script prints `OK content/packages/resnet/workspace/fixtures/stage-004/training_log.json` and exits 0.
2. **Hash mismatch** — temporarily edited `runner.yaml` to record a
   `deadbeef…` sha256. Script printed `FAIL … sha256 mismatch` with both
   recorded and actual hashes, and exited 1. Restored cleanly.
3. **Missing fixture** — temporarily moved `training_log.json` aside.
   Script printed `FAIL … fixture file is missing on disk` and exited 1.
   Restored cleanly.

Currently only `content/packages/resnet` declares fixtures, so the check
covers one file today (`workspace/fixtures/stage-004/training_log.json`)
and automatically picks up new packages and fixtures as they land.

## Out of scope

- Did not touch the placeholder training_log fixture itself — that is
  tracked separately under `## Open gaps from snapshot`.
- Did not change `researchcrafters validate` behavior; the SDK still runs
  its full sandbox-layer hash check during `pnpm validate`.
- Sibling backlog item "Decide a fixture refresh cadence" (line 91) was
  considered for batch claim but is a separate policy/metadata decision
  with its own surface (package metadata, README), so it was left
  pending rather than bundled into a CI-assertion change.

## Files touched

- `scripts/verify-fixture-hashes.mjs` (new)
- `.github/workflows/ci.yml`
- `backlog/02-erp-content-package.md`
