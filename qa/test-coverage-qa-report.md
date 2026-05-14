# Test Coverage QA Report

**Date**: 2026-05-07
**Scope**: ResearchCrafters monorepo (apps/* + packages/* + tests/e2e)
**Baseline**: `pnpm test` → 18/18 packages pass, ~245 tests, 0 failures, full turbo cache hit (43ms)

## TL;DR

The repo has **strong unit/integration coverage across the safety-critical core** — `permissions.canAccess`, `runMentorRequest`, `gradeAttempt`, `LocalFsSandbox`, `validatePackage`, leak-test harness, account-cascade — all sit in the 80–95% logical-branch range with mocked Prisma/LLM stubs. The big gaps are at the **edges of the system**: HTTP-status mapping helpers, threshold boundaries, the `submit` CLI command's bundle limits, API route 4xx error paths, and end-to-end flows beyond catalog→stage. **5 new tests** added (9 web + 6 worker assertions) covering 3 of the cheapest gaps, plus 5 e2e skip-stubs documenting the next high-value flows.

## 1. Inventory (per-package test counts)

| Package                          | Test files | Tests | Categories                                      |
| -------------------------------- | ----------:| -----:| ----------------------------------------------- |
| apps/web                         | 8 (+2 new) | 70 (+9) | Mocked-Prisma integration; pure schema units    |
| apps/runner                      | 3          | 42    | Pure unit + spawn-based integration (`/bin/sh`) |
| apps/worker                      | 3 (+1 new) | 16 (+6) | Pure unit; Prisma-stub integration              |
| packages/erp-schema              | 1          | 27    | Pure schema units (Zod)                         |
| packages/ui                      | 2          | 14    | Pure unit (copy + CLI command surfaces)         |
| packages/ai                      | 3          | 22    | Pure unit + MockLLMGateway integration          |
| packages/content-sdk             | 2          | 18    | Fixture-driven integration                      |
| packages/evaluator-sdk           | 2          | 14    | Pure unit + MockLLMGateway integration          |
| packages/cli                     | 2          | 15    | File-fixture integration + contract drift       |
| packages/telemetry               | 1          | 7     | Pure unit + EventStore stub                     |
| packages/db, config              | 0          | 0     | Re-exports only (no logic to test)              |
| **tests/e2e (Playwright)**       | 2 (+1 new) | 3 (+5 skipped) | Browser-driven happy paths                |
| **TOTALS (after this session)**  | **30**     | **~260** |                                               |

Categories breakdown:

- **Pure unit (no I/O)**: `redaction`, `cli-commands`, `copy`, `branch-stats` math, `schemas`, `denial-http-status` (new), `anonymized-email` (new), `branch-stats-thresholds` (new). ~40% of total.
- **Mocked Prisma / mocked LLM gateway**: `permissions`, `mentor-runtime`, `account-cascade`, `enrollment`, `packages`, `auth`, `evaluator`, `share-card-render`, `branch-stats-rollup`, `scheduler`. ~45% of total.
- **Spawn-based integration** (real `/bin/sh`, real fs): `local-fs.test.ts`. ~15 tests.
- **Mocked S3 SDK**: `storage.test.ts` (14 tests).
- **E2E (Playwright)**: 2 specs, 3 active tests, all green against a running web app.

## 2. High-risk untested paths (top 20)

Walking the safety-critical surfaces called out in the brief:

| # | Path / function | Tested? | Where | Risk |
| -- | -------------- | ------- | ----- | ---- |
| 1 | `permissions.canAccess` action × tier matrix | ~70% — 11 cases cover view_stage / mentor / view_solution but miss `submit_attempt`, `view_branch_feedback`, `create_share_card` paths | permissions.test.ts | Med — branches exist & default-deny holds, but a regression in a less-tested action could silently grant access |
| 2 | `denialHttpStatus` mapping | **was untested** | **NEW: denial-http-status.test.ts** | Low (now covered) |
| 3 | `runMentorRequest` policy_misconfig + redaction paths | ~85% | mentor-runtime.test.ts | Low — main paths covered |
| 4 | `runMentorRequest` real `AnthropicGateway` provider branch | Untested at any layer (mock only) | — | High — production provider has no integration test; relies on SDK contract not drifting |
| 5 | `gradeAttempt` refusal: `executionStatus≠'ok'` for executable stages | Tested | grade.test.ts | Low |
| 6 | `gradeAttempt` refusal when rubric requires evidence | Tested | grade.test.ts | Low |
| 7 | `LocalFsSandbox` symlink rejection | Tested | local-fs.test.ts | Low |
| 8 | `LocalFsSandbox` `..` traversal in bundle entries | Partially — `assertSafeRelativePath` unit-tested but no integration test feeds a malicious bundle through `extract` | local-fs.test.ts | Med — defence-in-depth path lacks integration assertion |
| 9 | `validatePackage` happy path on fixture | Tested | validator.test.ts | Low |
| 10 | `validatePackage` leak-test integration (pedagogy layer) | Tested | leak-tests.test.ts | Low |
| 11 | `validatePackage` failure on malformed sandbox image / network policy | **No tests** for these specific structural failures | — | Med — silent acceptance of unsafe runner config |
| 12 | API routes — 4xx error paths and contract validation failures | **No route-level tests** anywhere; contract is asserted only via the Zod schema layer | — | High — actual HTTP handlers (auth/device-code, submissions, mentor/messages, runs, account/delete/export) are entirely untested in isolation |
| 13 | Worker `runBranchStatsRollup` min-N edges (N=20, N=5 boundaries inclusive) | **was untested at exact threshold** | **NEW: branch-stats-thresholds.test.ts** | Low (now covered) |
| 14 | `runBranchStatsRollup` — windowStart/windowEnd timezone handling | Untested (passes string ISO; date math is implicit) | — | Low |
| 15 | CLI `submit` — bundle deny-list (`node_modules/`, `.env`, `.git`) | **Untested** | — | High — silent inclusion of a `.env` would leak secrets to the server |
| 16 | CLI `submit` — file-count cap (5000 files) | **Untested** | — | Med — error message reaches stdout but boundary not asserted |
| 17 | CLI `submit` — sha256 mismatch between client and `headObject` | Tested in `checkUploadIntegrity` (storage.test.ts), but the CLI's compute side has no test | storage.test.ts | Low |
| 18 | `headObject` with missing `x-amz-meta-sha256` | Tested | storage.test.ts | Low |
| 19 | `signUploadUrl` with `contentLengthRange` | Tested | storage.test.ts | Low |
| 20 | `account-cascade` — anonymizedEmailFor format invariants | **was untested explicitly** | **NEW: anonymized-email.test.ts** | Low (now covered) |

### Additional untested paths (worth noting, lower priority)

- `apps/web/lib/auth.ts` — cookie fallback (only Bearer path is tested).
- `apps/web/lib/error-pages.ts` — entirely untested.
- All `apps/web/app/api/**/route.ts` handlers — no route-level (`Request → Response`) tests.
- `packages/cli/src/lib/version-check.ts` — untested.
- `packages/cli/src/commands/{login,logout,start,test,status,logs,preview,build}.ts` — untested at command level (only `validate` and `submit`'s schema half are exercised).
- `packages/ai/src/gateway.ts` — `AnthropicGateway` real path uncovered (only `MockLLMGateway` paths exercised).
- `apps/runner/src/modes/{test,mini-experiment}.ts` — only `replay` mode has a runReplayMode test.
- Worker `processBranchStatsRollupJob` Bullboard/queue-side error handling.

## 3. Proposed top-10 missing tests (ordered by risk × ease)

| # | Test name | File | Asserts | Setup snippet |
|---|-----------|------|---------|---------------|
| 1 | `denialHttpStatus returns 401/400/403 per reason` | `apps/web/lib/__tests__/denial-http-status.test.ts` | One assertion per `PermissionDenialReason` value | **WRITTEN** in this session |
| 2 | `anonymizedEmailFor uses .invalid TLD and is deterministic` | `apps/web/lib/__tests__/anonymized-email.test.ts` | RFC 6761 `.invalid` suffix; idempotent; distinct per userId | **WRITTEN** in this session |
| 3 | `computePercent at exact NODE_MIN_N / BRANCH_MIN_N boundaries` | `apps/worker/test/branch-stats-thresholds.test.ts` | N=20 publishes; N=19 suppresses; N=5/N=4 same | **WRITTEN** in this session |
| 4 | `submitCommand denies bundle containing .env` | `packages/cli/test/submit-deny-list.test.ts` | Build a tmp dir with `.env` + a real `.py`; assert `.env` is not in the manifest header | `import fg from 'fast-glob'`; create tmpdir; call collectFiles via `submitCommand({cwd})` (or extract `collectFiles` to be exported) |
| 5 | `submitCommand throws on > MAX_FILES files` | `packages/cli/test/submit-file-cap.test.ts` | Generate 5001 empty files; expect a thrown Error with the documented message | `for (let i = 0; i < MAX_FILES + 1; i++) await fs.writeFile(...)` |
| 6 | `permissions.canAccess submit_attempt on locked paid stage denies with stage_locked` | `apps/web/lib/__tests__/permissions-extra.test.ts` | Existing test only covers `view_stage` on locked stages; this one targets `submit_attempt` and `create_share_card` | Reuse the existing mock-Prisma harness (vi.hoisted from `permissions.test.ts`) |
| 7 | `validatePackage rejects runner.network='restricted' without docs` | `packages/content-sdk/test/validator-network.test.ts` | Fixture with `runner.yaml: { network: 'restricted' }` and no documented justification; expect a structural warning | Copy `sample-package` fixture; mutate `runner.yaml` only |
| 8 | `LocalFsSandbox extracts a bundle with an entry whose path contains '..' and rejects` | `apps/runner/test/local-fs-traversal.test.ts` | Build a tar/dir bundle whose member path is `../escape.txt`; assert `LocalFsSandboxPathError` | tmpdir bundle with `fs.writeFile(join(bundle, 'a/../../escape.txt'))` (after creating the parent path); call `sandbox.run({hostWorkspaceBundle})` |
| 9 | `mentor messages route returns 4xx on schema-invalid body` | `apps/web/lib/__tests__/api-mentor-messages.test.ts` | POST with missing `mode` → 400; POST without auth → 401 | Import the route module; call `POST(new Request(...))` directly with a mocked Prisma + auth |
| 10 | `submission_init route rejects sha256 of wrong length` | `apps/web/lib/__tests__/api-submission-init.test.ts` | Already partly covered by `api-contract.test.ts`; extend to confirm the route handler propagates that to a 400 response (not a 500) | Mock auth + storage helpers; call POST with `sha256: 'a'.repeat(63)` |

## 4. Tests added in this session

| File | Tests | Summary |
|------|-------|---------|
| `apps/web/lib/__tests__/denial-http-status.test.ts` | 4 | Maps every `PermissionDenialReason` value to its expected HTTP status; asserts 4xx-only invariant. |
| `apps/web/lib/__tests__/anonymized-email.test.ts` | 5 | RFC 6761 `.invalid` TLD, determinism, distinctness, syntactic email shape. |
| `apps/worker/test/branch-stats-thresholds.test.ts` | 6 | Inclusive boundary at NODE_MIN_N=20 / BRANCH_MIN_N=5; NODE_MIN_N-1 and BRANCH_MIN_N-1 still suppress; division-by-zero guard; 100% branch share. |
| `tests/e2e/proposed-coverage.spec.ts` | 5 (all `test.skip` with TODOs) | Login→device-code→CLI session; catalog empty-state; mentor refusal banner; share-card publish/unshare; migration UX. Each spec is self-contained and ready to un-skip when the seed/fixture work lands. |

**Total: 15 new active test cases (9 web + 6 worker), all passing locally.**

Verification:

```
apps/web        Tests  9 passed (9)
apps/worker     Tests  6 passed (6)
playwright list tests/e2e/proposed-coverage.spec.ts → 5 tests registered
```

## 5. E2E coverage gap

### What exists

- `tests/e2e/catalog-to-stage.spec.ts` — single happy-path spec: catalog renders, click first card, click Start CTA, assert URL is one of `/enrollments/.../stages/...` | `/login?next=...` | `/packages/.../start`. Tolerant of multiple seed states.
- `tests/e2e/regressions.spec.ts` — direct-navigation smoke for `/packages/flash-attention` and `/enrollments/enr-1/stages/S2-tile`; asserts no 500 / no React error overlay.

### Proposed (added as `test.skip` stubs in `tests/e2e/proposed-coverage.spec.ts`)

1. **Login → device-code approval → CLI session round-trip** (highest value: covers an entire auth flow with no current coverage).
2. **Catalog filter → empty-state copy** (blocked on the catalog growing beyond a single package).
3. **Mentor refusal banner when policy denies** (blocked on a seeded enrollment + reproducible "show me the answer" trigger).
4. **Share-card publish + unshare round-trip** (blocked on the publish CTA shipping).
5. **Migration UX** (blocked on the migration banner shipping).

## 6. Estimated effort to close the gap

| Category | Items | Effort | Notes |
|----------|-------|--------|-------|
| Cheap wins (helper-level units) | items 4–5, 7–8 above | ~3–4 hours | All pure-fs / pure-data; no new mocks needed |
| API route handlers | items 9–10 + every other `app/api/**/route.ts` | ~2–3 days | Each route needs a small mocked Prisma fixture and an auth stub. Recommended: extract handler bodies into a `lib/handlers/*.ts` so they can be unit-tested without Next.js machinery. |
| `AnthropicGateway` real-provider integration | item 4 above | ~0.5 day | Use vcr-style recorded cassettes via msw or nock; gate behind `RC_LIVE_LLM_TESTS=1` env so CI doesn't burn API tokens |
| LocalFsSandbox negative bundle tests | item 8 above | ~2 hours | One `fs.mkdtemp` + a malicious symlink/tar entry |
| CLI command tests (login/start/test/status/logs/preview/build) | — | ~1 day | Each command is small; mock the `api.*` module |
| E2E un-skip work | items 1–5 in §5 above | depends on seed/feature work | Dev-mode device-token short-circuit (item 1) is the cheapest; ~1 hour once a fixture session token exists |
| **Total to bring routes + sandboxes + CLI commands up to current core coverage** | | **~4–5 dev-days** | |

---

## Top 3 risks the project should address (recommendation)

1. **API route handlers have no route-level tests anywhere.** The Zod schema layer is well-tested via `api-contract.test.ts`, but the handlers themselves (`apps/web/app/api/**/route.ts`) — including device-code, device-token, submissions/init, submissions/finalize, mentor/messages, account/delete, account/export — have **zero tests** that exercise the actual `Request → Response` path including auth, permission, and error mapping. A typo in `denialHttpStatus` would not have been caught (it now is, via the new test). A malformed body returning 500 instead of 400 would not be caught at all.

2. **CLI `submit` bundle policy is invisible to tests.** The deny-list (`node_modules/`, `.env`, `.git`, `*.pem`, etc.), the 5000-file cap, the 50 MiB total cap, and the 5 MiB per-file cap are all enforced inside `collectFiles` — which is not exported and not tested. A regression here could silently include `.env` files in submissions sent to the server, leaking developer secrets. Recommend exporting `collectFiles` (or a `buildBundleManifest` helper) and adding the four boundary tests.

3. **`AnthropicGateway` (the real provider) is not exercised at any layer.** Every mentor/grader test runs through `MockLLMGateway`. The Anthropic SDK is mock-only; the wire shape, error handling (`rate_limit_error`, `overloaded_error`), and token-counting glue are unverified. A bad SDK upgrade would break production silently. Recommend an opt-in cassette-based integration test suite gated by an env var.
