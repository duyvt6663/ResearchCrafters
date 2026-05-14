# S1 — Login Modal (with page fallback)

> **Module:** shared
> **Status:** archived (promoted, then wired end-to-end)
> **Owner:** spartan-duykhanh
> **Created:** 2026-05-14
> **Archived:** 2026-05-14

## Goal

Remove the context-loss + visual-jank that today's `/login` page introduces
when a learner clicks **Start package** on a `PackageCard`. Today the click
hands off to a server-redirect chain (`/packages/<slug>/start` →
`/login?next=...`) that yanks the learner to a sparse standalone page with
one GitHub button and a disabled email field. The package they were trying
to enter disappears from view, and the form has no Google option, no
password fallback, and no loading state.

## Hypothesis

*Learners who click **Start package** on a `PackageCard` while signed-out
will complete sign-in at a higher rate, and report less "where did I go?"
disorientation, when sign-in opens as a centered modal over the originating
page (with the package title surfaced in the modal header) compared to the
current full-page redirect to `/login`.*

Falsifiable signals we'd hold to:
- Funnel completion (`PackageCard.click → enrolled`) rises ≥ 5pp.
- Drop-off between sign-in success and reaching the first stage falls,
  because the post-auth `next=` is implicit (we already know the package).
- Direct-link visitors to `/login` still see the legacy full-page layout
  (no SEO regression, no broken bookmarks).

## In scope

- The modal layout itself: hierarchy, spacing, the order of providers
  (GitHub primary, Google secondary, email/password collapsed under "More
  ways to sign in").
- A page-fallback layout that re-uses the same form components, so direct
  visits to `/login` still work and feel deliberate (not a leftover).
- A **route toggle** at the top of the mock so a reviewer can flip between
  the modal and the page layout in one place and judge whether the visual
  language carries.
- Loading state on each provider button (button shows spinner + disables
  siblings, so a learner can't double-submit).
- Inline error band placement + an example error message.
- The `?next=<path>` mechanic — modal shows the originating package title;
  the page shows a generic copy line + a "back to where you were" link.

## Out of scope

- Wiring real OAuth providers. Today only `github` is configured in
  `apps/web/auth.ts`; Google + email/password need backend work
  (provider config, credentials provider, password storage policy, rate
  limiting) that the mock deliberately stubs.
- Magic-link copy / transactional email design — the placeholder lives in
  `apps/web/app/login/page.tsx:38` today and is owned by a separate
  workstream.
- Mobile-specific layout (bottom-sheet variant). The mock targets desktop
  + tablet; mobile gets a follow-up experiment if this one validates.
- Account-creation copy + ToS/Privacy footer wording — pending product/legal.

## How to view

```bash
pnpm --filter @researchcrafters/web dev
# open http://localhost:3000/experiments/s1-login-modal
```

## Manual test script

1. Land on `/experiments/s1-login-modal`. The mock shows a faux
   `PackageCard` for "ResNets from scratch" with a **Start package** CTA.
   Above it, a small "View as: [modal | page]" toggle controls which
   layout the CTA opens.
2. With **modal** selected, click **Start package**. A centered dialog
   opens. Confirm: the dialog title names the package
   ("Sign in to start *ResNets from scratch*"), GitHub is the primary
   button, Google is secondary, and the email/password fields are
   collapsed under "More ways to sign in" (chevron expands them).
3. Click the GitHub button. The button shows an inline spinner, the other
   provider buttons disable, and a stub `console.info` fires (no real
   redirect). Confirm there's no layout shift while the spinner is
   visible.
4. Re-open the modal, expand "More ways to sign in", submit with an empty
   email. The inline error band appears above the form (not as a toast),
   and focus returns to the email input.
5. Re-open the modal, type `not-an-email` and any password, submit. A
   different error message ("Enter a valid email address") replaces the
   previous one in the same band.
6. Press <kbd>Esc</kbd>. The modal closes. Press <kbd>Tab</kbd> repeatedly
   from the **Start package** button — focus must not get trapped behind
   the (now closed) overlay.
7. Switch the toggle to **page**. The CTA now navigates the same surface
   to a full-page mock (rendered inline below the toggle to keep the
   reviewer in one URL). Confirm the page layout uses the *same* form
   components, just with a more spacious container, a sub-headline that
   acknowledges the missing context ("You'll come back to *ResNets from
   scratch* after signing in"), and a back link.
8. Misuse: in **page** mode, hide the "back to where you were" link by
   clearing the `next` query (toggle in the mock). Confirm the page
   degrades gracefully — no broken link, just a "Back to catalog" CTA.

## Validation criteria

- **Success looks like:** Reviewers agree the modal feels lighter and
  preserves context; the page fallback feels deliberate, not vestigial.
  No accessibility regressions (Esc, focus return, no focus trap on
  closed overlay). Provider button order is uncontroversial.
- **Failure looks like:** Reviewers find the modal cramped on common
  laptop widths, or the collapsed "more ways to sign in" pattern hides
  email/password too aggressively, or the page fallback is so different
  from the modal that we'd be designing two surfaces.
- **Inconclusive:** Reviewers split on provider ordering or on whether
  email/password should be collapsed by default. Iterate the mock with
  both variants behind the same toggle and re-review.

## Findings

Append-only. Each entry: `YYYY-MM-DD — <reviewer> — <one paragraph>`.

- 2026-05-14 — spartan-duykhanh — Modal-over-PackageCard read better than the
  full-page redirect: package title stays in view, no jarring viewport reset,
  email/password collapsing keeps the GitHub path the obvious primary. Page
  fallback still feels deliberate (not vestigial) because both surfaces share
  the same `LoginForm` body. Decided to ship modal-on-overview-CTA + page on
  direct visits, with Google + email/password rendered as visibly disabled
  ("Coming soon") since the providers are not yet wired in
  `apps/web/auth.ts`. Skipping the PackageCard-level trigger for now —
  PackageCard renders as an `<a href>` from the catalog, and the cleaner
  intercept point is the package overview's "Start package" CTA.

## Decision

`promote → archived`. Shipped to production via the integration below.

## Integration sketch

Where this landed in production:

- **`packages/ui/src/components/LoginForm.tsx`** — shared form body. GitHub
  enabled, Google + credentials rendered as disabled with a `Coming soon`
  hint. Server actions are passed in as `onGithubSignIn` / `onGoogleSignIn` /
  `onCredentialsSubmit` props so the primitive stays auth-backend-agnostic.
- **`packages/ui/src/components/LoginModal.tsx`** — `Dialog` + `LoginForm`
  with a header that names the surface the learner came from
  (`contextTitle` prop).
- **`apps/web/components/StartPackageCta.tsx`** — client wrapper around the
  Start CTA. Authenticated → `<a href="/packages/<slug>/start">`. Signed-out
  → opens `LoginModal` with the package title surfaced; the bound GitHub
  server action redirects back to the start route on success.
- **`apps/web/app/packages/[slug]/page.tsx`** — replaces the inline anchor
  on the right rail with `<StartPackageCta>`; reads `getSession()` to drive
  the authenticated branch.
- **`apps/web/app/login/page.tsx`** — page-fallback surface. Reads `?next=`,
  binds it into a GitHub server action, renders `LoginForm` in a centered
  card. `/packages/<slug>/start:35` still server-redirects here for direct
  visits / shared links, so the route is not vestigial.

Backend work that was deliberately *not* done in this PR (provider
configuration is the gate):

- Google provider in `apps/web/auth.ts` and `auth.config.ts`.
- Credentials provider + password storage policy + rate limiting on
  `/api/auth/*`.
- Drop the disabled hints in `LoginForm` once the providers above land —
  the UI surface is already wired, only the handler props need to be
  supplied.
