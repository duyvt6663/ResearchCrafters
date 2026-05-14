# packages/ui

Shared design tokens, primitives, and the named MVP components from
`backlog/09-frontend-design.md`.

`copy/` holds the authored copy library — paywall, refusal, execution-failure,
rare-branch suppression, runner-offline, and migration UX strings. Engineers
must not invent these inline.

## Primary Backlog Item

- `backlog/09-frontend-design.md` — design system, components, behaviors,
  performance budget, anti-patterns.

## Related Backlog Items

- `backlog/01-mvp-platform.md` — components consumed by `apps/web`.
- `backlog/05-mentor-safety.md` — authored mentor refusal copy.
- `backlog/06-data-access-analytics.md` — share-card payload renderer, branch
  suppression display rules.

## Depends on

- Nothing internal in MVP. Tailwind config and tokens live here.

## Notes

- Tokens are published as a typed module, not duplicated across components.
- CLI command blocks render from a shared source synchronized with
  `backlog/03-cli-runner.md`.
