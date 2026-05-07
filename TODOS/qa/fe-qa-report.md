# Frontend QA Report

Date: 2026-05-07
Target: `http://localhost:3001` (live dev server, seeded with `resnet@0.1.0`)
Seeded enrollment id: `cmovf11u5001dakq882p0iob3` (user `cmovf11sk0000akq8dksxjqny`, package version `cmovf11t40009akq840ry9qje`, active stage `S001`)
Seeded user email: `fixture@researchcrafters.dev`

---

## TL;DR

- **2 confirmed source bugs** in route handlers (`Promise` JSON-serialised
  instead of `await`-ed): `/api/packages` returns `{"packages":{}}` and
  `/api/enrollments/:id/graph` returns `{"graph":{}}` — see bug B1, B2 below.
- **2 unhandled-exception 500s** on POST routes that read `req.json()` without
  a zod guard: `/api/stage-attempts` and `/api/share-cards` 500 on `{}` body.
- **1 broken nav link**: the top nav `My packages` -> `/enrollments` 404s
  because `apps/web/app/enrollments/page.tsx` does not exist.
- **1 dev-server stability blocker** (the biggest immediate ship risk): under
  Playwright load the Next.js dev server's webpack chunk cache corrupts
  (`Error: Cannot find module './3879.js'`); routes start oscillating
  500 / 404 / `_not-found` and stay broken for tens of seconds at a time. This
  is what made the Playwright suite produce wildly different counts on
  successive runs (12 failed / 8 passed -> 6 passed / 12 failed / 5 skipped).
  Production builds are not affected by this specific failure mode; the bug
  lives in dev tooling.
- **Auth contract surprise (not a bug)**: `/api/entitlements` and
  `POST /api/packages/:slug/enroll` do **not** return 401 anonymously. The
  `permissions.canAccess` policy intentionally treats both as
  `view_stage` over a free-preview pseudo-stage so the catalog flow can run
  without sign-in. The QA brief expected 401; the codebase explicitly does
  the opposite. This is worth aligning between docs and policy.

Counts:
- Total HTTP routes hit: **29** (22 GET, 7 POST)
- 5xx routes during QA: **2 deterministic** (`/api/stage-attempts`,
  `/api/share-cards`) plus a transient bucket of 8 routes that flipped to
  500/404 mid-run because of the webpack-cache regression.
- Broken expectations: **5** (B1-B5 below).
- Ship blocker: **1** (dev-server cache corruption — D1).

---

## Per-route results

The probe script is `/tmp/qa/probe.sh`; raw body files are under
`/tmp/qa/bodies/`. Each route was hit at least twice over the session; the
"first/steady" column reports the most informative observation. "Drift"
flags routes that returned different status codes during the same session
because of the dev-server cache regression (D1).

### Pages (HTML)

| Route | Status | Drift | Snippet | Finding |
|---|---|---|---|---|
| `GET /` | 200 | yes (->500 once) | `<h1>...heroTitle...</h1>` (catalog renders, single ResNet card) | Healthy. |
| `GET /packages/resnet` | 200 | yes (->500) | `<h1>ResNet: Deep Residual Learning for Image Recognition</h1>` and three `/start` Start CTAs | Healthy when compiled. |
| `GET /packages/does-not-exist` | 404 | no | Standard Next 404 page (`<title>404: This page could not be found.</title>`) | Correct (`notFound()` from `getPackageBySlug` null branch). |
| `GET /packages/resnet/start` | 307 -> `/login?next=/packages/resnet/start` | no | Location header set | Correct unauth redirect. |
| `GET /enrollments/<seed>/stages/S001` | 200 | yes (->500) | `<h1 class="rc-stage-header">Why is going deeper not enough?</h1>`, `.rc-stage-map__title` present | Healthy. |
| `GET /enrollments/<seed>/share` | 200 | yes (->500) | `<h1>Share your run</h1>`, ShareCardPreview present | Healthy. |
| `GET /enrollments` | **404** | no | Standard Next 404 page | **Broken nav link** (B3). The `My packages` link in `Layout.tsx` points here but no `app/enrollments/page.tsx` exists. |
| `GET /login` | 200 | no | Login page renders | Healthy. |
| `GET /logout` | 200 | no | Logout page renders | Healthy. |
| `GET /auth/device` | 307 -> `/login?next=%2Fauth%2Fdevice` | no | Location header set | Unauth-gated, redirects to login. |
| `GET /auth/device?user_code=ABCD-1234` | 307 -> `/login?next=...` | no | Same | Same. The "pending state" the QA brief mentions is only reachable after sign-in. |

### API (JSON)

| Route | Status | Drift | Body | Finding |
|---|---|---|---|---|
| `GET /api/health` | 200 | yes (->500/404) | `{"ok":true}` | Healthy. |
| `GET /api/packages` | 200 | yes (->500/404) | **`{"packages":{}}`** | **B1**: `app/api/packages/route.ts:22` returns `listPackages()` without `await`; the unresolved `Promise` is JSON-serialised as `{}`. The catalog page calls `listPackages()` correctly with `await` so the UI is unaffected, but the public JSON contract is wrong. |
| `GET /api/packages/resnet` | 200 | yes | `{"package":{"slug":"resnet",...}}` | Healthy. |
| `GET /api/packages/does-not-exist` | 404 | no | `{"error":"not_found"}` | Correct. |
| `GET /api/entitlements` | 200 | yes | `{"entitlements":[]}` | **B5**: returns 200 anonymously instead of 401. Intentional per `permissions.canAccess` (treats this as a `view_stage` on a free-preview pseudo-stage). Worth aligning with the QA expectation; either tighten the policy for `/api/entitlements` (route can short-circuit on `!session.userId`) or update the spec. |
| `GET /api/auth/session` | 200 / **500** | yes | `null` / Next error HTML | NextAuth returns `null` for anon (correct). The 500s during the suite were the webpack-cache regression. |
| `GET /api/auth/csrf` | 200 / **500** | yes | `{"csrfToken":"..."}` / Next error HTML | Same — NextAuth handler is fine, dev server flake. |
| `GET /api/auth/providers` | 200 / **500** | yes | non-empty providers map / Next error HTML | Same. |
| `GET /api/cli/version` | 200 | yes | `{"minCliVersion":"0.0.0"}` | Healthy. |
| `GET /api/enrollments/<seed>/state` | 200 | yes | `{"enrollment":{"id":"cmovf11u5001dakq882p0iob3","userId":"cmovf11sk0000akq8dksxjqny","packageSlug":"resnet","packageVersionId":"cmovf11t40009akq840ry9qje","activeStageRef":"S001","unlockedStageRefs":["S001"],"completedStageRefs":[]}}` | Healthy and reflects seed. |
| `GET /api/enrollments/<seed>/graph` | 200 | yes | **`{"graph":{}}`** | **B2**: `app/api/enrollments/[id]/graph/route.ts:29` returns `getDecisionGraph(id)` without `await`. Same root cause as B1. The CLI / future graph view will see an empty object instead of `{nodes,edges}`. |
| `POST /api/packages/resnet/enroll` (`{}`) | 200 | yes | `{"enrollmentId":"enr-resnet-1778168856083","packageVersionId":"resnet@stub","firstStageRef":"S001","enrollment":{...}}` | Healthy in the path that matters, but **note the `packageVersionId: "resnet@stub"` fallback** — this branch fires whenever the policy decides the call is allowed but the route can't bind a real `packageVersion` row. The "stub" id will be quietly written into share-card / mentor / submission payloads. (Anonymous calls hit this branch by design because `session.userId` is null; signed-in calls go through the live-DB path.) |
| `POST /api/auth/device-code` (`{}`) | 200 / 500 | yes | `{"deviceCode":"...","userCode":"...","verificationUri":"http://localhost:3000/auth/device","verificationUriComplete":"...","expiresIn":600,"interval":5}` | The `verificationUri` hardcodes `http://localhost:3000` even though the dev server is on 3001. Minor but confusing for CLI testing. |
| `POST /api/auth/device-token` (`{"device_code":"dummy"}`) | 400 | no | `{"error":"expired_token"}` | Good — schema validation kicks in before DB. |
| `POST /api/stage-attempts` (`{}`) | **500** | no | empty body | **B4**: `route.ts:17-19` does `(await req.json()) as Body; getEnrollment(body.enrollmentId)` without zod-validating. Prisma rejects `id: undefined` and the unhandled error becomes a 500 with no JSON envelope. Should mirror `/api/submissions` (zod -> 400). |
| `POST /api/submissions` (`{}`) | 400 | no | structured zod errors with `error: "bad_request"` | Healthy reference shape; B4 should follow this. |
| `POST /api/share-cards` (`{}`) | **500** | no | empty body | **B4 sibling**: same anti-pattern as `/api/stage-attempts`. |
| `POST /api/mentor/messages` (`{}`) | 400 | no | structured zod errors | Healthy. |

---

## Playwright run

Command: `PLAYWRIGHT_BASE_URL=http://localhost:3001 pnpm test:e2e`
Browser: Chromium 1217 (already installed under `~/Library/Caches/ms-playwright`).

The suite was run **three times** during QA. Results varied dramatically
because of D1 (dev-server cache corruption):

| Run | Specs | Passed | Failed | Skipped | Notes |
|---|---|---|---|---|---|
| 1 (first) | catalog-to-stage + regressions + new api-smoke + new stage-and-share | 8 | 10 | 0 | API endpoints flaked to 500 mid-run. |
| 2 (regressions only) | regressions.spec.ts | 2 | 0 | 0 | Both passed once the routes recompiled. |
| 3 (full) | all specs | 6 | 12 | 5 | Even more endpoints flaked; tests with `test.skip()` on 4xx fired (= seeded enrollment 404'd because the route module went missing). |

Tests that pass deterministically when the dev server is healthy (verified
by curl): `regressions.spec.ts` (both cases), `catalog-to-stage.spec.ts`
(when the catalog finishes compiling before the click), the new
`api-smoke.spec.ts` cases for `/api/health`, `/api/packages`,
`/api/cli/version`, `/api/auth/session`, `/api/submissions` (400),
`/api/entitlements`, and the new `stage-and-share.spec.ts` cases when
`/enrollments/<seed>/stages/S001` is currently compiled.

Tests that **always fail today** (deterministic, not flaky):
- `api-smoke.spec.ts > POST /api/stage-attempts with empty body returns a structured error, not 500` -> 500 (B4).
- `api-smoke.spec.ts > POST /api/share-cards with empty body returns a structured error, not 500` -> 500 (B4).
- `stage-and-share.spec.ts > /enrollments index 404s ...` deliberately *expects* the 404 to document B3; it passes.

The new specs added by this QA pass:
- `tests/e2e/api-smoke.spec.ts` — 12 anon API surface checks.
- `tests/e2e/stage-and-share.spec.ts` — stage player, share card, and the
  documented `/enrollments` 404 (B3).

Existing specs were not modified.

---

## Top 5 gaps (ordered by severity)

### 1. D1 — Dev-server webpack chunk cache corrupts under load (BLOCKER for FE QA)

What: under any non-trivial concurrent load (Playwright spawning 4-8
workers, or a curl loop hitting >5 distinct routes), the dev server begins
emitting `Error: Cannot find module './3879.js'` /
`MODULE_NOT_FOUND` for `_document.js`. After that, most routes alternate
between 500 and 404. The root cause is visible in the dev log as
`<w> [webpack.cache.PackFileCacheStrategy] Caching failed for pack: ENOENT`.

Impact: any FE-level regression suite is unrunnable end-to-end against the
shared dev server. Two consecutive `pnpm test:e2e` runs produced 8/10 vs
6/12 results purely from this. This blocks reliable QA, blocks demo
dependability, and silently masks real regressions.

Likely cause: webpack's pack-file rename race in Next 15.5.16 dev mode on
APFS (macOS). `apps/web/.next/cache/webpack/edge-server-development/0.pack.gz_`
fails to rename to `0.pack.gz` while the prior file is held open by a
worker. Subsequent builds emit chunks (`3879.js`, `1393.js`, ...) that
reference modules that aren't on disk yet.

Mitigation today: run `rm -rf apps/web/.next` and restart the dev server.
The QA brief forbids restarting the user's server, so I documented the
state without trying to recover.

Fix paths:
- Pin Next.js to a version with a fix for this rename race (track upstream
  issue) or move dev-mode caching to in-memory (`turbo` / `experimental.turbo`).
- Make Playwright use `webServer` with a dedicated `.next-test` cache dir
  (set `NEXT_DIST_DIR` per worker) so the QA dev server is isolated from
  the human dev server.
- Add a tripwire health probe in CI that fails fast on `_not-found` JSON
  responses for known-good API routes (today the suite swallows them as
  schema mismatches).

### 2. B1/B2 — Two route handlers JSON-serialise unresolved Promises

`apps/web/app/api/packages/route.ts:22`:
```ts
return NextResponse.json({ packages: listPackages() });
```
`listPackages` is `async`; this serialises `Promise{}` to `{}`. The route
returns `{"packages":{}}`.

`apps/web/app/api/enrollments/[id]/graph/route.ts:29`:
```ts
return NextResponse.json({ graph: getDecisionGraph(id) });
```
Same shape; returns `{"graph":{}}`.

Impact: anyone consuming these endpoints from outside the web app (CLI,
admin tools, future dashboards) gets empty payloads. The web pages are not
affected because they call the data layer directly with `await`.

Fix: prepend `await` to both expressions. Add a unit test asserting
`Array.isArray(body.packages)` and `Array.isArray(body.graph.nodes)`.

### 3. B4 — Two POST routes 500 on missing/invalid body instead of 400

`apps/web/app/api/stage-attempts/route.ts:17-19` and
`apps/web/app/api/share-cards/route.ts:17-19` cast the parsed JSON body via
`as Body` and pass `body.enrollmentId` (possibly `undefined`) directly to
`getEnrollment` -> Prisma. Prisma throws on `id: undefined`, the route has
no try/catch, and Next emits a 500 with empty body.

The codebase already has the right pattern in `/api/submissions` and
`/api/mentor/messages` (zod schema -> 400 + structured `reason`). Both
offending routes should adopt it.

Impact: a malformed CLI request crashes the route surface and pollutes
error metrics with un-categorisable 500s. The empty body also breaks
typed-error rendering in the FE (no `error.code` to switch on).

Fix: add zod schemas in `lib/api-contract.ts` (`stageAttemptRequestSchema`,
`shareCardRequestSchema`); validate before any DB call.

### 4. B3 — Top-nav "My packages" link points at a route that doesn't exist

`packages/ui/dist/components/Layout.js` (and source `Layout.tsx`) ships:
```ts
links: [{ href: "/", label: "Catalog" }, { href: "/enrollments", label: "My packages" }]
```
But `apps/web/app` has **no `enrollments/page.tsx`** — only the dynamic
sub-route `enrollments/[id]/...`. Every navigation through the nav 404s.

Impact: most visible UX bug in the entire product surface. Anyone who clicks
the obvious "see my packages" link gets a 404 page.

Fix: add `apps/web/app/enrollments/page.tsx` (server component) listing the
session's enrollments via `prisma.enrollment.findMany({ where: { userId } })`,
or change the nav link to `/login?next=...` for unauth users and to a
specific enrollment for auth users.

### 5. B5 — Anonymous access to `/api/entitlements` and `/api/packages/:slug/enroll` (intentional but mismatches QA spec)

`permissions.canAccess` (lines 129-132) lets anonymous callers through any
`view_stage` action on a free-preview unlocked stage. Both routes invoke
that with synthetic stage descriptors (`{ ref: "entitlements", ... }` /
`{ ref: firstStage.ref ?? "S1", isFreePreview: true }`), so they return 200
without a session.

For `/api/packages/:slug/enroll`, the anonymous response carries a stub
`packageVersionId: "resnet@stub"` and a synthesised `enrollmentId`. There
is no DB write. This is non-obvious failure mode that downstream code
(share-card, mentor, submissions) does not currently distinguish from a
real enrollment id.

Impact: today, callers expecting 401 will silently receive a fake
enrollment payload they cannot use elsewhere (because `getEnrollment`
returns `null` for the synthetic id, every follow-up route 404s).

Fix options:
- Tighten the policy: short-circuit on `!session.userId` for these specific
  routes and return 401, leaving the catalog/free-preview flow as the only
  open surface.
- Or document the contract explicitly: anonymous callers get a 200 stub but
  receive `enrollmentId: null` so downstream code can branch.

---

## Suggested follow-ups

Code (`apps/web/app/...`):
- [ ] Add `await` in `app/api/packages/route.ts:22` and
      `app/api/enrollments/[id]/graph/route.ts:29` (B1/B2).
- [ ] Add zod schemas + 400 envelopes for
      `app/api/stage-attempts/route.ts` and `app/api/share-cards/route.ts`,
      mirroring `app/api/submissions/route.ts` (B4).
- [ ] Add `app/enrollments/page.tsx` listing the session's enrollments
      (or fix the nav link in `packages/ui/src/components/Layout.tsx`) (B3).
- [ ] Decide on the `/api/entitlements` /
      `/api/packages/:slug/enroll` anonymous semantics; if 401 is the
      contract, short-circuit before `permissions.canAccess` (B5).
- [ ] Replace the hardcoded `http://localhost:3000` in
      `app/api/auth/device-code/route.ts` with a request-derived origin so
      device-flow URIs match the actual server port (minor).

Tooling:
- [ ] Use a worker-scoped `.next` cache dir for Playwright
      (`webServer.env.NEXT_DIST_DIR`), or pin a Next version that fixes the
      pack-file rename race, to address D1.
- [ ] Add `apps/web/lib/__tests__/api-contract.spec.ts` covering the
      structured-error shape so B4 regressions can't reach main.

Tests added by this pass:
- `tests/e2e/api-smoke.spec.ts` — anonymous API surface contract.
- `tests/e2e/stage-and-share.spec.ts` — stage player + share publish surface
  + documented `/enrollments` 404.
