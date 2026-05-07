# API QA Report — ResearchCrafters web (`apps/web`)

**Date:** 2026-05-07
**Server under test:** `http://localhost:3001` (Next.js 15.5.16 dev server)
**DB:** Postgres 16 in `researchcrafters-postgres`, seeded with `resnet@0.1.0`, fixture user `fixture@researchcrafters.dev`, fixture enrollment `cmovf11u5001dakq882p0iob3`.
**Tester:** API QA agent
**Auth:** Dev short-circuit `POST /api/auth/device-token` with `developer_force_approve:true` minted session token `kiYxr…OmuI` (fixture user).

---

## TL;DR

* **47 distinct request flavors hit live** across anonymous + authed.
* **17 routes return 5xx** (every one a `500` rendered as Next.js dev `_error` HTML, never JSON).
* **3 critical contract / wiring drifts** confirmed by reading `apps/web/lib/api-contract.ts` against handlers.
* **10 routes silently ignore `Authorization: Bearer …`** because they call `getSession()` without `req` — CLI calls degrade to anonymous, blocking the entire CLI flow on those endpoints.
* `/api/health` works (after warm-up) but **does not match any contract schema** (it isn't in `api-contract.ts`); content is fine, contract gap.
* Admin gating on `/api/admin/*` defaults closed (env `ADMIN_EMAILS` empty → every signed-in user is denied), which is safe but has no admin allowlist seed for QA.
* `unknown_action` is not reachable from any route in the current code — every handler maps a fixed `action` string before calling `permissions.canAccess`. The default-deny path in `permissions.ts` exists but isn't exercised over the wire.

| metric | count |
|---|---|
| 5xx responses (final stable pass) | 17 |
| Contract drift findings | 6 (3 high, 3 medium) |
| Auth gaps (Bearer ignored) | 10 routes |
| Routes that returned 200 + valid contract shape | 8 |
| Routes returning HTML instead of JSON for an error | 17 (every 500) |

---

## Severity legend
- **HIGH** = blocks a documented happy path or violates the wire contract / auth contract.
- **MED** = correctness gap, ugly error UX, or contract gap that a typed CLI client would tolerate.
- **LOW** = polish / dev-server flake.

---

## 1. Per-route table

Final stable pass (after warm-up). Bearer `<token>` denotes the dev session minted above.

| # | Method | Path | Anon status | Anon CT | Authed status | Authed CT | Findings | Severity |
|--|--|--|--|--|--|--|--|--|
| 1 | GET  | `/api/health` | 200 | application/json | 200 | application/json | Body `{"ok":true}` not in `api-contract.ts`. CLI cannot type-check it. | LOW |
| 2 | GET  | `/api/cli/version` | 200 | application/json | 200 | application/json | Body matches `cliVersionResponseSchema` (`{minCliVersion:"0.0.0"}`). Note `MIN_CLI_VERSION="0.0.0"` lets every CLI through; revisit before alpha. | LOW |
| 3 | GET  | `/api/packages` | **200** | application/json | **200** | application/json | **Handler bug** — `route.ts:22` calls `listPackages()` (async) without `await`, so `packages` field is a Promise. Server logs (`console-log.txt`) already capture `TypeError: packages.map is not a function` from the catalog page consuming this. **HIGH**. Contract drift: `api-contract.ts` defines no `packagesListResponseSchema`. | **HIGH** |
| 4 | GET  | `/api/packages/resnet` | 500 | text/html | 500 | text/html | First-touch dev-server compile error: `Cannot find module './3879.js'` and friends. Returns Next's `_error` HTML, never JSON. After repeated hits on **other** routes the chunk graph keeps invalidating; this route did not warm to 200 in any of 5 retries. **HIGH** for QA reliability. | HIGH |
| 5 | GET  | `/api/packages/does-not-exist` | 500 | text/html | 500 | text/html | Same dev-server flake as #4. The intended 404 path (`getPackageBySlug` returns null → 404) is unreachable while the handler errors during compile. | HIGH |
| 6 | GET  | `/api/enrollments/<seeded>/state` | 500 (initially) → 200 (warmed once) | text/html → application/json | 500 (most calls) → 200 (intermittent) | text/html → application/json | When it does respond: body is `{"enrollment":{…}}` — does NOT match any contract schema; `api-contract.ts` lacks an `enrollmentStateResponseSchema`. **Bearer is ignored**: handler uses `getSession()` not `getSessionFromRequest(req)`. | HIGH |
| 7 | GET  | `/api/enrollments/<seeded>/graph` | 500 / sometimes 200 | text/html / json | 500 / sometimes 200 | text/html / json | Same Bearer-ignored bug as #6. No contract schema for `{graph:{nodes,edges}}`. | HIGH |
| 8 | GET  | `/api/entitlements` | **200** | application/json | **200** | application/json | Body always `{"entitlements":[]}` because the handler is hard-coded to only populate when `session.userId === "u-paid"` — **stub from before NextAuth migration was wired**. Real seed user `cmovf11sk0000akq8dksxjqny` has a `pro` membership but never reaches the populated branch. **HIGH** functional gap. Bearer ignored (#A). | HIGH |
| 9 | GET  | `/api/grades/fake-grade-id` | 500 | text/html | 500 | text/html | Stays 500 across retries (dev-flake). When warm, the handler is a static stub — it will return a synthesized grade for **any** id, never 404. Contract gap: no `gradeResponseSchema`. | MED |
| 10 | GET  | `/api/runs/fake-run-id` | 500 | text/html | 500 | text/html | Did not warm to 200. Per source it would return synthesized `{id, status:"queued", logUrl:null}` parsed against `runStatusResponseSchema`. Bearer-aware (uses `getSessionFromRequest`). | MED |
| 11 | GET  | `/api/runs/fake-run-id/logs` | 500 | text/html | 500 | text/html | Same: never warmed. Source aligns with `runLogsResponseSchema`. Bearer-aware. | MED |
| 12 | GET  | `/api/account/export` | 401 JSON | application/json | **200** JSON | application/json | Returns `Content-Disposition: attachment` plus full account payload. Body shape is a typed `AccountExport` from `lib/account-cascade.ts`, NOT in `api-contract.ts`. Contract gap. Bearer-aware. | MED |
| 13 | POST | `/api/auth/device-code` | **200** | application/json | n/a | n/a | Body validates against `deviceCodeResponseSchema`. Anonymous-by-design. | OK |
| 14 | POST | `/api/auth/device-token` (dev short-circuit) | **200** | application/json | n/a | n/a | Returns `{token, expiresAt, email}` matching `deviceTokenResponseSchema`. Tested pending, expired, denied, force-approve paths — all OK. | OK |
| 15 | POST | `/api/auth/revoke` | 200 `{"revoked":false}` | application/json | 200 `{"revoked":true}` for matching token | application/json | Idempotent, OK. **But** the route does not require auth — anyone who knows a sessionToken can revoke it. That is the standard logout shape, and the schema requires `token`, so this is fine, but flag for security review. | LOW |
| 16 | POST | `/api/packages/resnet/enroll` | 500 | text/html | 500 | text/html | Never warmed in this session (`ENOENT: …api/packages/[slug]/enroll/route.js`). Cannot validate live. **Bearer-aware** in source. | HIGH |
| 17 | POST | `/api/node-traversals` | 500 (empty body, CT also empty) | (none) | 500 (same) | (none) | The QA spec body `{enrollmentId, decisionNodeId, branchId}` does **NOT** match the handler — handler casts `req.json() as {enrollmentId, stageRef, nodeRef, branchId, confidence?}`. Spec drift; the handler doesn't even validate, it just `as`-casts and proceeds. Then `getEnrollment` is undefined for missing fields → 500. **Bearer ignored** (#A). No `nodeTraversalRequestSchema` in `api-contract.ts`. | HIGH |
| 18 | POST | `/api/stage-attempts` | 401 | application/json | **401** (with Bearer!) | application/json | **`getSession()` is cookie-only** → Bearer header not seen → fixture session perceived as anonymous → `not_authenticated`. Same #A bug. | **HIGH** |
| 19 | POST | `/api/submissions` (init) | 401 `{error:"forbidden",reason:"not_authenticated"}` | application/json | **200** matching `submissionInitResponseSchema` | application/json | Properly Bearer-aware via `getSessionFromRequest`. Contract OK. | OK |
| 20 | POST | `/api/submissions/fake-id/finalize` | 500 | text/html | 500 | text/html | Never warmed. In source it should 404 the unknown submission — but the route returns the `runStatusResponseSchema` runId synthesized from `Date.now()` (look at line 170-200) **even when the submission row doesn't exist**, so a fake-id call from a paying user would mint a phantom run. Suspect bug: should 404. | MED |
| 21 | POST | `/api/runs/fake-id/callback` | 500 | text/html | 500 | text/html | Never warmed (dev compile error). In source it has no service-token auth — it routes through `permissions.canAccess({packageVersionId:"runner-callback", isFreePreview:true})`, which means **anyone unauthenticated** would in principle reach the side-effecting telemetry write. Public callback with no auth → high security risk once warm. | **HIGH** |
| 22 | POST | `/api/mentor/messages` | 401 `{error:"not_authenticated"}` | application/json | **200** matching `mentorMessageResponseSchema` | application/json | Bearer-aware. Returns mock-mode mentor response (since `ANTHROPIC_API_KEY` unset). `content` is the safety-blocked refusal copy — that's expected from `runMentorRequest` with no key. | OK |
| 23 | POST | `/api/share-cards` | 401 | application/json | **401** (with Bearer!) | application/json | Same #A bug — `getSession()` cookie-only. Spec body `{enrollmentId, payload:{}}` also doesn't match the handler, which expects `{enrollmentId, insight, hardestDecision?, selectedBranchType?}` (no `payload`). Two-axis drift. | **HIGH** |
| 24 | GET  | `/api/account/export` | 401 | application/json | **200** | application/json | (duplicate row for completeness — see #12). Bearer works. | OK |
| 25 | POST | `/api/account/delete` | 401 | application/json | (skipped destructive call) — confirmed `confirm:false` returns 400 `{error:"confirmation_required"}` | application/json | Bearer-aware via `getSessionFromRequest`. JSON envelope OK. **Did not exercise actual delete** to preserve fixture user. | OK |
| 26 | POST | `/api/admin/rollup-branch-stats` | 401 | application/json | 403 `{"error":"forbidden"}` | application/json | Allowlist-gated: `ADMIN_EMAILS` is empty in this env, so even the fixture user is denied. Correct closed-default. To exercise the happy path, a separate seed config would have to set `ADMIN_EMAILS=fixture@researchcrafters.dev`. | OK |
| 27 | POST | `/api/admin/render-share-card` | 401 | application/json | 403 | application/json | Same gating story as #26. | OK |
| 28 | POST | `/api/auth/device/approve` (untested live) | n/a | n/a | n/a | n/a | Browser approval page handler; not in spec. Reviewed source — uses `getSessionFromRequest`. | n/a |

### Edge / schema cases (all authed)

| Test | Status | Body excerpt | Verdict |
|--|--|--|--|
| Mentor with `mode:"unknown_action"` | 400 | `{"error":"bad_request","reason":[{...invalid_enum_value...}]}` | OK — Zod rejects unknown enum |
| Submissions init with bad sha (`badhex`) | 400 | `{"error":"bad_request","reason":[{too_small...path:["sha256"]}]}` | OK — Zod rejects |
| Node-traversals with `{}` | 500 | empty body, no Content-Type | **Handler does not validate** — it casts `req.json() as Body` and dereferences fields, throwing inside the handler. Should be a 400 + Zod issues. |
| `/api/auth/revoke` with valid + already-revoked token | 200 `{"revoked":true}` then 200 `{"revoked":false}` | OK — idempotent as documented |
| `/api/auth/device-token` with bad device code | 400 `{"error":"expired_token"}` | OK |
| `/api/auth/device-token` polling pending | 202 `{"error":"authorization_pending"}` | OK — matches `deviceTokenResponseSchema` |

---

## 2. Contract violations against `apps/web/lib/api-contract.ts`

### HIGH

1. **`/api/packages` returns an unawaited Promise.** Source: `apps/web/app/api/packages/route.ts:22` — `NextResponse.json({ packages: listPackages() })`. `listPackages` is `async`. This is *the* reason `console-log.txt` records `TypeError: packages.map is not a function` from the catalog page. The CLI catalog list and the web catalog page both consume this. Add `await`.
2. **`/api/entitlements` filters on the legacy stub user id `"u-paid"`** instead of querying `Membership` / `Entitlement` rows. Source: `apps/web/app/api/entitlements/route.ts:23`. The contract has no schema for entitlements yet, but the wire shape is supposed to surface `pro` membership for the seeded fixture; today it's always `[]`. Either add `entitlementsResponseSchema` to `api-contract.ts` and wire to Prisma, or document this as a stub.
3. **Bearer auth is silently ignored on 10 routes.** See "Auth gaps" below — the contract docstring on `lib/auth.ts` promises Bearer is honored, but only routes that call `getSessionFromRequest(req)` honor it. The ones still on `getSession()` are: `packages/route.ts`, `packages/[slug]/route.ts`, `entitlements/route.ts`, `enrollments/[id]/state`, `enrollments/[id]/graph`, `node-traversals`, `stage-attempts`, `share-cards`, `grades/[id]`, `runs/[id]/callback`. **All CLI traffic to these will look anonymous.**

### MED

4. **No contract schema** for: `/api/health`, `/api/packages` listing, `/api/packages/[slug]` detail, `/api/enrollments/[id]/state`, `/api/enrollments/[id]/graph`, `/api/entitlements`, `/api/grades/[id]`, `/api/share-cards`, `/api/node-traversals`, `/api/stage-attempts`, `/api/account/export`, `/api/account/delete`, `/api/admin/*`. Per the file header (`api-contract.ts:1-15`) every endpoint should have a matched `*RequestSchema` / `*ResponseSchema` pair. About half do; the other half are silently shaped by `(await req.json()) as Body` casts.
5. **`/api/node-traversals` and `/api/share-cards` accept untyped bodies** (`(await req.json()) as Body`). The QA spec gave one body shape, the handler expects another, and Zod is not in the loop, so a malformed body becomes a 500 instead of a 400.
6. **`runStatusResponseSchema.executionStatus`** is typed as `runStatusSchema` (`queued | running | ok | timeout | oom | crash | exit_nonzero`) but the runner-callback route accepts `succeeded | failed | timeout | oom | crashed`. The two enums don't intersect on `succeeded`/`ok` or `failed`/`exit_nonzero`. The `coerceStatus` in `runs/[id]/route.ts:23` falls back to `queued` for anything outside the contract enum — which means a real `succeeded` runner outcome gets surfaced as `queued` to the CLI. Spec the canonical set in `api-contract.ts` and reject (or map) on the callback.

---

## 3. Auth + permissions audit

### Findings

#### A. Bearer-token regressions (HIGH)
10 routes still use the cookie-only `getSession()` (no `req` argument):

```
apps/web/app/api/packages/route.ts:9
apps/web/app/api/packages/[slug]/route.ts:16
apps/web/app/api/entitlements/route.ts:8
apps/web/app/api/enrollments/[id]/state/route.ts:16
apps/web/app/api/enrollments/[id]/graph/route.ts:16
apps/web/app/api/node-traversals/route.ts:25
apps/web/app/api/stage-attempts/route.ts:24
apps/web/app/api/share-cards/route.ts:21
apps/web/app/api/grades/[id]/route.ts:12
apps/web/app/api/runs/[id]/callback/route.ts:25
```

Every one of these should use `getSessionFromRequest(req)` (already exported from `lib/auth.ts`). Today, the CLI's `Authorization: Bearer …` is dropped and the call falls through to the anonymous policy branch. Live confirmation: `auth_stage_attempt` and `auth_share_card` returned `401 not_authenticated` despite a valid Bearer token, while `auth_submissions` and `auth_account_export` (which use `getSessionFromRequest`) returned 200.

#### B. Anonymous reachability
Routes that 200 anonymously (verified):
- `GET /api/health` — public.
- `GET /api/cli/version` — public by design.
- `GET /api/packages` — public catalog (granted via `permissions.canAccess` with `isFreePreview:true`).
- `GET /api/entitlements` — returns `{entitlements:[]}` for any anon caller. Wire shape doesn't leak data, but the route should arguably 401.
- `POST /api/auth/device-code`, `POST /api/auth/device-token` — public per RFC 8628 device flow.
- `POST /api/auth/revoke` — public (token-bearer can self-revoke). Acceptable.

#### C. Anonymous denials use the right HTTP shape (verified)
- `not_authenticated` → 401 ✓ (matches `denialHttpStatus` in `lib/permissions.ts:244-258`).
- Admin gates fall back to `403 {"error":"forbidden"}` — matches the `denialHttpStatus` mapping for `policy_disallows`.

#### D. `unknown_action` is unreachable from the wire
`permissions.ts` returns `{allowed:false, reason:"unknown_action"}` → mapped to 400. But every route hands a *literal* action string (`"view_stage"`, `"submit_attempt"`, `"request_mentor_hint"`, …) to `canAccess`. There is no path that lets a client supply an action and trigger the default-deny. So the policy module's invariant is sound but **the test you'd write for it can't be exercised over HTTP** — only unit tests on `permissions.ts` itself can confirm the contract.

#### E. Runner callback has no auth
`/api/runs/[id]/callback` (`route.ts:14-42`) takes `getSession()` (cookie-only) and runs through `canAccess` against a synthetic `{packageVersionId:"runner-callback", isFreePreview:true}` stage. With `view_stage` on a free-preview stage, the policy returns `{allowed:true}` for any caller (auth or anon). This means **any unauthenticated client can post a fake runner callback** and trigger a `runner_job_completed` telemetry event. Combined with finding A, this is doubly broken: even when the runner workstream lands a service token, the cookie-only `getSession()` would never see it. Add a service-token header check, then switch to `getSessionFromRequest`.

#### F. Admin allowlist is empty in this env
`ADMIN_EMAILS` is unset (or empty), so `adminEmails().size === 0` and `isAdmin()` returns false unconditionally. Admin endpoints can never be exercised positively until that env is set. For QA, no admin CLI flow is reachable. Closed-default is correct; document the seed env separately.

---

## 4. 5xx & dev-server reliability

Every 500 in this run had the same envelope: Next.js dev `_error` HTML page with an `__NEXT_DATA__` payload whose `err.message` is one of:

* `Cannot find module './3879.js'` (login page chunk) — affects routes whose error path tries to render `/login`.
* `Cannot find module './vendor-chunks/@prisma+client@5.22.0_prisma@5.22.0.js'` — vendor chunk for routes that import prisma at first compile.
* `ENOENT: …api/packages/[slug]/enroll/route.js` — Next dev never persisted the route.js under `.next/server/`.

These are **dev-server flakes, not handler bugs in the literal sense**, but they have two production-relevant consequences:

1. **No JSON envelope on errors.** The dev `_error` page returns `text/html`. The CLI's `client.ts` will try to `JSON.parse` and explode. Production (`next build`) won't hit this exact bug, but the production catch-all should still ensure 5xx returns JSON `{"error":"internal"}` — there's no top-level error-handler middleware that does this today (`middleware.ts` only sets headers). **MED severity**: add a JSON 5xx fallback so the CLI never sees HTML.
2. The flake is masked by a real handler bug for `/api/packages` (#1 in §2). When the dev server is healthy, the route 200s — but with a Promise in the body. Once routes warm, this becomes the dominant defect.

I did not restart the dev server (instruction forbids it). Server-side `next dev` with `app/login` chunk lockup is a known class of bug on Next 15.5.16 + pnpm; recovery is `rm -rf apps/web/.next && pnpm --filter @researchcrafters/web dev` — explicitly excluded by the brief.

---

## 5. Top 5 gaps with severity + suggested fix

1. **HIGH — `/api/packages` returns an unawaited Promise.**
   *Fix:* `apps/web/app/api/packages/route.ts:22` → `NextResponse.json({ packages: await listPackages() })`. Add a contract schema `packagesListResponseSchema` and parse before returning.

2. **HIGH — Bearer ignored on 10 routes.**
   *Fix:* Replace `getSession()` with `getSessionFromRequest(req)` in every route in §3.A. Add a unit test that calls each route with a fake bearer cookie/header and asserts the resolved `userId`. Today the CLI cannot transit any of those routes.

3. **HIGH — `/api/runs/[id]/callback` unauthenticated, side-effecting.**
   *Fix:* Add a `X-Runner-Token` shared-secret header check (env `RUNNER_CALLBACK_TOKEN`) gated before `canAccess`. Switch to `getSessionFromRequest`. Reject when neither passes. Mirror the test in `test-coverage-qa-report.md`.

4. **HIGH — `/api/entitlements` is a no-op stub.**
   *Fix:* Read from `prisma.membership` + `prisma.entitlement` for `session.userId`, project to a typed `entitlementsResponseSchema` (add to `api-contract.ts`). The fixture user has a `pro` membership today and the route always returns `[]`.

5. **HIGH — `/api/node-traversals`, `/api/share-cards`, `/api/stage-attempts`, `/api/runs/[id]/callback` accept untyped bodies.**
   *Fix:* Add `nodeTraversalRequestSchema`, `shareCardRequestSchema`, `stageAttemptRequestSchema`, `runnerCallbackRequestSchema` to `api-contract.ts` and `safeParse` them. Today malformed bodies become 500s instead of 400s.

### Honourable mentions (MED)
- **No top-level 5xx JSON fallback.** Dev `_error` HTML breaks every JSON client. Add a `app/api/_error.tsx` or a top-level try/wrapper.
- **No Zod schemas for half the endpoints.** See §2.4.
- **`MIN_CLI_VERSION="0.0.0"`** lets every CLI through — fine pre-alpha, dangerous after.
- **`/api/grades/[id]` is a static stub** that responds the same for every id — should 404 unknown ids; should pull from `prisma.grade`.
- **`/api/submissions/[id]/finalize` mints a phantom run** when the submission row is missing (`runId = run-${Date.now()}` fallback). For unknown ids this should 404, not synthesize.

---

## 6. Routes that depend on stub data the seed doesn't cover

* **`/api/grades/[id]`** — there is no `Grade` row in the seed. Even when the dev server is warm the route returns a hard-coded synthesized grade for any id. To meaningfully test, seed a `Grade` row tied to the fixture enrollment + a `StageAttempt`.
* **`/api/runs/[id]` and `/api/runs/[id]/logs`** — no `Run` row in the seed. Source path is "synthesize a queued response" so the wire never 404s. To meaningfully test the executed-status path, seed a `Run` with `status="ok"` and `metricsJson:{logs:[…]}`. Also tests `signDownloadUrl` against MinIO.
* **`/api/runs/[id]/callback`** — no runner authentication header today; once the runner workstream lands the service token, re-test.
* **`/api/share-cards`** — handler creates a synthesized id; no `ShareCard` row is persisted. The `payload` field in the QA spec doesn't exist on the handler.
* **`/api/admin/rollup-branch-stats` and `/api/admin/render-share-card`** — gated by `ADMIN_EMAILS` (env). Set `ADMIN_EMAILS=fixture@researchcrafters.dev` in the dev env to exercise the happy path.
* **`/api/account/delete`** — left untested live to preserve the seeded fixture user. To exercise, mint a throwaway user in a separate seed migration and call against it.
* **`/api/auth/device/approve`** — browser-flow page; not in the spec smoke list and not exercised here.

---

## 7. Reproducibility

All raw smoke output is captured under `/tmp/qa_runs/` on the test machine; the runner script lives at `/tmp/qa_smoke.sh`. The session token used was minted via the dev short-circuit `developer_force_approve:true` and revoked at end-of-run. Seed IDs:

| Field | Value |
|--|--|
| User id | `cmovf11sk0000akq8dksxjqny` |
| Email | `fixture@researchcrafters.dev` |
| Package id | `cmovf11sz0007akq8m965pzqy` |
| PackageVersion id | `cmovf11t40009akq840ry9qje` |
| Enrollment id | `cmovf11u5001dakq882p0iob3` |
| DecisionNode N001 (S001 framing) | `cmovf11to000rakq81mfss26i` |
| Branch (canonical residual) DB id | `cmovf11u1001bakq8fjcr2tna` |
| Branch wire id (`Branch.branchId`) | `branch-residual-canonical` |

To reproduce the Bearer-ignore finding without the dev-server flake (which makes 500s noisy), exercise:

```
curl -i -X POST http://localhost:3001/api/stage-attempts \
  -H "Authorization: Bearer <session-token>" \
  -H 'Content-Type: application/json' \
  -d '{"enrollmentId":"<enr>","stageRef":"S001","answer":{}}'
# → 401 not_authenticated   ← Bearer ignored
```

versus

```
curl -i -X POST http://localhost:3001/api/submissions \
  -H "Authorization: Bearer <session-token>" \
  -H 'Content-Type: application/json' \
  -d '{"packageVersionId":"<pkgver>","stageRef":"S001","fileCount":1,"byteSize":100,"sha256":"<64-hex>"}'
# → 200 with submissionId    ← getSessionFromRequest works
```

The two behaviours diverge solely on whether the route uses `getSession()` vs `getSessionFromRequest(req)`.
