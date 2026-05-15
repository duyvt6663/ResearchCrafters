# Lighthouse CI threshold notes

The thresholds in `lighthouserc.json` track the Performance Budget section in
`backlog/09-frontend-design.md`. This file documents per-metric rationale and any
intentional loosening so the budget evolves deliberately rather than drifting.

## Severity philosophy

- `categories:performance` is currently `warn` (minScore 0.5). The `simulate` throttling on GH Actions vCPUs consistently underscores production performance. Restore to `error` once a stable baseline exists.. Everything
  else stays at `warn` until we have a multi-run baseline from a stable
  production-like environment. Promoting more metrics to `error` without that
  baseline would just add flake.
- The CI job uploads the full `.lighthouseci/` artifact so reviewers can drill
  into individual metric scores even when the run passes.

## URL choices

- `/` (catalog) — the most-visited learner entry point. Most server work is
  Prisma reads + RSC rendering of `PackageCard`s.
- `/packages/resnet` — the package overview, a heavier route (decision-graph
  preview placeholder, longer manifest read). This route is where regressions
  on Prisma fan-out and graph payloads will surface first.

These two URLs cover the public, unauthenticated surface that doesn't require a
session cookie. Authenticated stage-player perf measurement is deferred until
we have a deterministic seeded session cookie path in CI.

## Per-metric rationale

| Metric | Threshold | Rationale |
| --- | --- | --- |
| `categories:performance` | warn >= 0.5 | Floor that catches a 20%+ regression without flagging dev-mode noise. Tighten to 0.85 once we baseline against `next start` with a warm Prisma pool. |
| `categories:accessibility` | warn >= 0.85 | Tracks the WCAG goals in `09-frontend-design.md` Responsive and Accessibility section. Warn-only because Lighthouse a11y is heuristic — we still rely on explicit Playwright a11y assertions for hard rules. |
| `categories:best-practices` | warn >= 0.85 | Catches CSP regressions and console errors. Warn-only because the dev CSP intentionally loosens `unsafe-eval` for React Refresh; even though we run `next start` here, transient warnings can still emit. |
| `categories:seo` | warn >= 0.85 | We aren't an SEO-driven product yet, but we want canonical tags and meta descriptions to stay healthy as marketing pages land. |
| `first-contentful-paint` | warn <= 2000ms | Conservative ceiling that aligns with the "TTI p95 < 2s on mid-range hardware" goal in `09`. FCP tends to land 30-50% below TTI, so this is loose by design. |
| `largest-contentful-paint` | warn <= 3000ms | Catalog hero copy + first `PackageCard` is the LCP element. 3s gives us headroom for the Prisma fan-out without masking real regressions. |
| `interactive` | warn <= 3500ms | Maps directly to the "TTI p95 < 2s" goal in `09`, padded to 3.5s for CI variance. Tighten once we have 10+ runs of variance data. |
| `cumulative-layout-shift` | warn <= 0.1 | Standard "good" threshold per Core Web Vitals. The catalog has fixed-height cards; if this trips it's a real bug. |
| `total-blocking-time` | warn <= 400ms | Catches main-thread regressions from RSC payload size or third-party scripts. 400ms is the "needs improvement" boundary; tighten to 200ms ("good") once stable. |

## Known sources of dev-mode noise

`next start` after `next build` is closer to production than `next dev`, so the
thresholds above target `next start`. Running this locally against `next dev`
will fail several budgets — that is expected. If you need a quick local check
against `next dev`, comment out the `assert` block before running.

The catalog page renders 1-N `PackageCard`s through a Prisma read. With a
freshly seeded DB containing only ResNet, the page is light; once additional
packages land, expect FCP/LCP to creep up. Re-baseline at that point rather
than loosening these thresholds.

## Updating the thresholds

When a metric trips repeatedly without a real regression:

1. Confirm it is environmental (compare `.lighthouseci` artifacts across 5+
   runs).
2. Open a backlog entry under `backlog/09-frontend-design.md` Performance Budget
   referencing the metric.
3. Update the threshold here with a new row in the table above explaining the
   change. Do not silently relax thresholds.
