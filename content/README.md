# content/

Versioned content for the platform.

- `packages/` — flagship and onboarding ERPs. Each is a self-contained package
  per `docs/PRD_v2.md` and `backlog/02-erp-content-package.md`.
- `templates/` — authoring templates that scaffold a new ERP.

## Primary Backlog Item

- `backlog/02-erp-content-package.md` — package anatomy, ARA layers, curriculum
  graph, stage content, workspace, fixture acquisition, review gates.

## Related Backlog Items

- `backlog/04-validation-evaluator.md` — `researchcrafters validate` runs against
  every package here in CI.

## Notes

- Package source is the canonical store. The database mirrors it for product
  queries and analytics.
- New enrollments use the latest live `package_version`; existing enrollments
  stay pinned per `backlog/06-data-access-analytics.md`.
