# apps/web

The learner-facing web app: catalog, package overview, session player, decision
graph view, mentor panel, paywall, share cards.

Stack target: Next.js + React + Tailwind, with route handlers serving the
product API until pressure justifies splitting `apps/api`.

## Primary Backlog Item

- `backlog/01-mvp-platform.md` — product surfaces, enrollment, entitlement gates,
  error/empty states, share flow.

## Related Backlog Items

- `backlog/09-frontend-design.md` — visual system, stage player UX, copy library,
  performance budget, anti-patterns.
- `backlog/06-data-access-analytics.md` — telemetry, branch-stats suppression,
  share-card payload, migration UX.
- `backlog/04-validation-evaluator.md` — grade schema rendered by the grade panel.
- `backlog/05-mentor-safety.md` — mentor visibility states and authored copy.

## Depends on

- `packages/db` — typed DB access and Prisma client.
- `packages/erp-schema` — package/stage/branch typed schemas.
- `packages/content-sdk` — package loader.
- `packages/ui` — shared components, tokens, copy library.
- `packages/ai` — mentor gateway client.
- `packages/evaluator-sdk` — grade rendering helpers.
