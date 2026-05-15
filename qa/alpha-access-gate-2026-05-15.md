# QA: Basic gated manual access for alpha — 2026-05-15

## Scope

Backlog item: `backlog/00-roadmap.md:68` — *"Add basic billing or gated
manual access for alpha."* (Phase 2: MVP Product Loop)

For the alpha cohort we don't need a payment flow — we need a way to keep
the running deployment private to invited learners. This change adds a
minimal, env-driven email allowlist that gates NextAuth sign-in.

Out of scope:

- Stripe / billing / paid entitlements (already partially wired in the
  domain model — `Membership`, `Entitlement` rows in
  `packages/db/prisma/migrations/0_init/migration.sql`).
- Database-backed allowlist with admin CRUD UI.
- Per-package or per-stage allowlists; this is sign-in level only.

## Implementation

- New module `apps/web/lib/alpha-allowlist.ts` exporting
  `parseAllowlist`, `decideAlphaAccess`, and `isAlphaAccessAllowed`.
  Edge-safe (no Node-only imports), so it can run from
  `apps/web/auth.config.ts` which is shared with the Edge middleware.
- `apps/web/auth.config.ts` gains a NextAuth `signIn` callback that
  resolves the email from `user.email` (falling back to `profile.email`)
  and returns `false` when the allowlist gate denies. GitHub provider
  now also requests `read:user user:email` scope so the primary email
  is available even when the public profile email is null. When
  `ALPHA_ACCESS_ALLOWLIST` is unset or empty the gate is OFF and every
  authenticated user is allowed (dev / pre-alpha behaviour preserved).
- `apps/web/app/login/page.tsx` reads `?error=` and renders a friendly
  alert for `AccessDenied` (the NextAuth code emitted when `signIn`
  returns false). All other error codes get a generic fallback message.
  The pre-existing `<a href="/">` got migrated to `next/link` to clear
  a stale `@next/next/no-html-link-for-pages` lint error in the same
  file.
- `.env.example` documents `ALPHA_ACCESS_ALLOWLIST`.
- New unit test `apps/web/lib/__tests__/alpha-allowlist.test.ts` covers
  empty/unset allowlists (gate OFF), missing email, case-insensitive
  match, and the deny path.

## Validation

Commands run from `apps/web/`:

- `pnpm test` — `27 passed | 1 skipped (28)`, `185 passed | 9 skipped`,
  including the new `alpha-allowlist.test.ts` (7 tests, all passing).
- `pnpm typecheck` — clean.
- `pnpm lint` — clean (the pre-existing
  `no-html-link-for-pages` error in `app/login/page.tsx` is fixed).

Manual reasoning (not exercised in a live browser — no live OAuth
client configured locally):

- Gate OFF: `ALPHA_ACCESS_ALLOWLIST=""` → `decideAlphaAccess` returns
  `{ allowed: true, reason: "allowlist_disabled" }` for any email,
  including `null`. NextAuth `signIn` callback returns `true`.
- Email match: `ALPHA_ACCESS_ALLOWLIST="Alice@Example.com"`,
  user.email=`alice@example.com` → allowed (case-insensitive).
- Email miss: same env, user.email=`stranger@example.com` →
  callback returns `false`, NextAuth redirects to
  `/login?error=AccessDenied`, which now renders the alpha-list
  explainer banner.
- Missing email: same env, user.email=null and profile has no email →
  denied with `missing_email` reason; redirected the same way.

## Remaining risks / follow-ups

- **GitHub private emails.** NextAuth + the GitHub provider stores the
  primary email retrieved from `https://api.github.com/user/emails` so
  long as `user:email` scope is granted. We now request that scope
  explicitly. If a user revokes it on the GitHub consent screen the
  email will be null and the allowlist gate will deny. Today the
  login page surfaces a generic AccessDenied message; a more specific
  "GitHub did not return your email" copy is a nice-to-have for later.
- **Operational ergonomics.** The allowlist lives in env. Rotating the
  cohort requires a redeploy. When alpha grows we should move this to
  a `AlphaAccessGrant` table with an admin UI; the env path is
  intentionally minimal for the first cohort and can be removed once
  the DB-backed path lands.
- **Existing sessions.** The gate only fires at sign-in. Users with a
  live session row will keep working until that session expires. This
  matches the alpha goal (invite new people; existing testers keep
  access) but is worth documenting in any rollout note.
