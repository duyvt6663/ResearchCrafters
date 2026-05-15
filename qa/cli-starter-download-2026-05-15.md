# QA — CLI starter-workspace download / extract

**Date:** 2026-05-15
**Backlog item:** `backlog/03-cli-runner.md:48` — "Download starter workspace."
**Branch:** skynet/pr/landing-evidence-artifact-2026-05-15

## What changed

- New `packages/cli/src/lib/starter.ts` implements a pure-Node USTAR /
  GNU / PAX tar parser plus a gzipped-tar extractor. No new runtime
  dependency; uses `node:zlib` `gunzipSync`.
- `packages/cli/src/commands/start.ts` now downloads the signed
  `starterUrl` (when the enroll route surfaced one) via the existing
  `api.downloadSignedUrl` helper and extracts the bundle into the
  project directory. Stdout summary reports `extracted` / `skipped` /
  `download failed` with file count + byte total.
- Re-running `start` against a workspace that already contains anything
  besides `.researchcrafters/` skips the extract — we don't stomp on a
  partial attempt.

## Safety properties enforced by extractor

- Path-traversal entries (`../foo`, `a/../../b`) are skipped silently.
- Absolute POSIX paths (`/etc/passwd`) and Windows drive-letter paths
  (`C:/...`) are rejected.
- Entry names containing NUL bytes are rejected.
- Resolved entry paths must remain inside the destination directory
  (defense-in-depth `startsWith(absDest + sep)` check after
  `safeEntryPath`).
- Symlinks (`typeflag=2`), hardlinks (`typeflag=1`), and device entries
  are surfaced as `type: 'other'` and never materialized.
- Per-file size cap: `STARTER_MAX_FILE_BYTES` = 5 MiB.
- Total uncompressed cap: `STARTER_MAX_BYTES` = 50 MiB.
- File-count cap: `STARTER_MAX_FILES` = 5000.

The caps mirror the existing `submit` bundle policy
(`packages/cli/src/commands/submit.ts`).

## Tests

`packages/cli/test/starter-extract.test.ts` (new, 10 tests):

- `safeEntryPath` cases for absolute paths, parent-dir traversal,
  Windows drive letters, NUL bytes, leading `./`, backslashes, empty
  and dot-only names.
- `extractStarterTarGz`:
  - materializes regular files and nested directories from a USTAR
    archive built in-test;
  - silently skips `../escape.txt` and `/abs.txt` entries — neither
    side of the destination boundary receives the file;
  - skips symlink (`typeflag=2`) and hardlink (`typeflag=1`) entries;
  - rejects a single file larger than `STARTER_MAX_FILE_BYTES`.

### Verification

```
$ pnpm --filter @researchcrafters/cli typecheck
$ pnpm --filter @researchcrafters/cli test
 Test Files  7 passed (7)
      Tests  58 passed (58)
```

All pre-existing CLI suites continue to pass (login, contract,
status-render, submit-bundle, completion, validate, integration-live-api).

## Out of scope

- Wiring real seeded starter bundles for `content/packages/resnet`
  (storage seeding is tracked in the "Open gaps" section of
  `backlog/03-cli-runner.md`).
- `start --refresh` to re-download into an existing workspace —
  current implementation deliberately refuses to overwrite. Can be
  added when there's a use case.
- Tar v7-format archives (pre-USTAR). The web seeder controls the
  bundle format; we standardize on `tar czf`-produced USTAR.
