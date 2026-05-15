# QA — `start` resolves signed starter URL + smoke command (2026-05-15)

## Scope

Backlog item `backlog/03-cli-runner.md:45`:

> On `start`, resolve package version, entitlement, stage manifest, and signed
> starter URL. _(package version and stage resolve; signed starter URL is not
> returned.)_

The previous iteration had deliberately removed `starterUrl`, `apiUrl`, and
`smokeCommand` from the enroll contract because the route never populated them
(see `qa/cli-entitlements-polish-2026-05-15.md`). This iteration re-introduces
the two fields the route can actually populate (`starterUrl`, `smokeCommand`)
as **optional** contract fields and wires them end-to-end.

`apiUrl` stays out of the contract: the CLI reads its API base from
auth/login state, not enroll responses, and the QA report explicitly called
that field out as never-needed.

The related backlog item `backlog/03-cli-runner.md:48` (download starter
workspace) was **not** claimed: it depends on storage seeding and tar
extraction in the CLI, both of which are larger than one safe change.

## Changes

| File | Change |
| --- | --- |
| `apps/web/lib/api-contract.ts` | `enrollResponseSchema` gains optional `starterUrl: z.string().url()` and `smokeCommand: z.string().min(1)`. Still `.strict()`, so unknown fields (e.g. `apiUrl`) keep failing. |
| `apps/web/app/api/packages/[slug]/enroll/route.ts` | After resolving `packageVersionId`, the route head-checks `packages` bucket at `starters/<slug>/<packageVersionId>.tar.gz` and signs a GET URL if the object exists; storage errors fall back to no URL. `smokeCommand` is read from `manifest.smokeCommand` / `manifest.smoke_command` when non-empty. Fields are omitted from the response when unresolved so the strict schema doesn't carry `undefined` keys. |
| `packages/cli/src/lib/api.ts` | `EnrollResponse` and `StartPackageResponse` regain optional `starterUrl` / `smokeCommand`. `startPackage` forwards them when present. |
| `packages/cli/src/lib/config.ts` | `LocalProjectConfig` gains optional `starterUrl`. `smokeCommand` already existed. |
| `packages/cli/src/commands/start.ts` | When the enroll response carries `starterUrl` / `smokeCommand`, both are persisted into `.researchcrafters/config.json`. The TODO comment about a separate `/starter-url` endpoint is removed; CLI prints a one-line hint that a starter bundle is available (download is the next item). |
| `packages/cli/test/contract.test.ts` | The "must reject `starterUrl`/`smokeCommand`" assertions flip to "must accept when valid"; `apiUrl` rejection stays, and an invalid `starterUrl` (non-URL) still fails. |
| `packages/cli/test/integration-live-api.test.ts` | Doc comment updated. |
| `apps/web/lib/__tests__/route-packages-enroll.test.ts` | New 5-case suite pinning: starter signed when object exists, omitted when absent, fall-back-on-throw, anon callers get neither field (no live version), and `smoke_command` snake-case alias. |

## Verification

- `pnpm --filter @researchcrafters/cli build` → clean.
- `pnpm --filter @researchcrafters/cli test` → 48 passed (contract.test
  updated assertions green).
- `pnpm --filter @researchcrafters/web typecheck` → clean.
- `pnpm --filter @researchcrafters/web test` → 222 passed, 9 skipped (new
  `route-packages-enroll.test.ts` 5 tests green).

## What still needs to happen for the rollup to close

Tracked separately on the backlog:

- `backlog/03-cli-runner.md:48` — download + unpack the starter workspace. The
  signed URL is now available; the CLI needs a tar.gz extractor (no
  dependency exists today) and to handle the case where the bundle is gone
  by the time the CLI follows the URL.
- Storage seeding for the packages bucket (`starters/<slug>/<pkgVersionId>.tar.gz`).
  The route is ready to surface a URL the moment the object exists; until a
  build/seed step puts one there, the response shape is the same as before.
- Open gap `backlog/03-cli-runner.md` line 351 mentions a "durable starter
  bundle seeding" task — that's the seeding half and is intentionally not in
  this iteration.

## Risks / call-outs

- The route now performs an extra `HeadObject` per enroll call. The call is
  cheap against MinIO/S3 and is wrapped in a try/catch so MinIO outages
  degrade to "no starterUrl" rather than 500. If enroll latency becomes a
  concern, caching the head result by `(slug, packageVersionId)` is the
  obvious follow-up.
- `manifest.smokeCommand` is read raw from the manifest JSON. The CLI
  executes it via `child_process.spawn(..., { shell: true })`, so a
  malicious manifest with `;` could still chain commands. That's a
  pre-existing risk on the `test` command and isn't changed here; the
  package-author trust boundary lives at publish time.
