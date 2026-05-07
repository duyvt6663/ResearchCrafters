# packages/db

Prisma schema, migrations, and typed client. Source of truth for the relational
data model.

`prisma/` holds schema and migrations; the typed client wrapper lives in `src/`.

## Primary TODO

- `TODOS/06-data-access-analytics.md` — table inventory, package build mirroring,
  permissions policy, version + patch policy, branch-stats privacy, telemetry,
  events storage, migration UX.

## Related TODOs

- `TODOS/08-infra-foundations.md` — provisioning, shadow DB, seed scripts,
  encryption-at-rest fields.
- `TODOS/04-validation-evaluator.md` — `grades` table consumed by the evaluator.
- `TODOS/05-mentor-safety.md` — `mentor_threads`, `mentor_messages` cost fields.

## Notes

- Package source is git/object storage; `db/` is the index for product queries
  and analytics, not the canonical store.
- Audit-grade events are dual-written here; product analytics goes to PostHog.
