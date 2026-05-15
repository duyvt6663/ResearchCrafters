# QA — Package Landing Page: Pricing / Waitlist CTA

Date: 2026-05-15
Backlog: `backlog/01-mvp-platform.md` — "Show pricing or waitlist call-to-action."
Surface: `apps/web/app/packages/[slug]/page.tsx` (right-rail "Pricing" card)

## Change

Before: the Pricing card rendered an inert `StatusBadge` containing the
price/waitlist string. There was no actionable button — the marketing
surface declared "Pricing" but never gave the learner anywhere to click.

After: the Pricing card renders a new `PricingCta` client component
(`apps/web/components/PricingCta.tsx`) with two variants driven by
`pkg.pricing.cta`:

- `buy` — shows `$X/month` prominently, a short value-line ("Free preview
  included — pay to unlock every stage, mentor feedback, and run history."),
  and a primary button-styled `<a>` linking to `/packages/${slug}/start`.
- `waitlist` — shows a short explanatory line and a primary button. On
  submit, a server action (`joinWaitlistAction`) records a
  `waitlist_intent` telemetry event scoped to the slug and the CTA flips
  to an inline acknowledgement ("Thanks — we'll let you know when this
  package opens.").

The server action is bound per-slug at render time so the client component
cannot fabricate intent for another package. The action does not yet
persist email — the backlog has no waitlist store; this is captured as
intent-only signal until that infra is built.

`TelemetryEvent` gained one new value (`waitlist_intent`).

## Verification

1. `cd apps/web && npx tsc --noEmit` — clean.
2. `cd apps/web && npx vitest run lib/__tests__/data/packages.test.ts` —
   7/7 pass. The data layer's `pricing` projection is unchanged; the
   existing tests assert the `waitlist` fallback when manifest pricing is
   absent, which `PricingCta` consumes unchanged.
3. Manual code inspection of `apps/web/app/packages/[slug]/page.tsx`
   confirms:
   - `StatusBadge` import is retained (still used by the stage list).
   - The Pricing card's `CardBody` now hosts `<PricingCta />` with the
     existing `copy.packageOverview.priceCta` / `waitlistCta` labels.
   - `joinWaitlistAction` is declared as `"use server"` alongside the
     existing `signInWithGithubForStart` action.

## Scope notes

- No new API route, database table, or email collection. The waitlist
  surface captures intent through the existing telemetry sink; persistence
  is deferred until the broader pricing/waitlist infra is scheduled in the
  backlog.
- The "buy" variant points at the existing `/packages/${slug}/start` flow
  rather than a checkout — checkout infra does not yet exist; the start
  route is the canonical "begin the free preview, then upgrade" path
  consistent with `docs/MARKETING.md` §9 ("Free: onboarding package and
  first 1-2 stages…").
- `MARKETING.md` §11 ("Pricing or waitlist — Keep the CTA direct.") is
  satisfied: each variant renders one button with one verb.
