# packages/content-sdk

Loads packages from disk, resolves cross-layer ARA links, performs the package
build pipeline, and produces the database-mirror manifest.

## Primary Backlog Item

- `backlog/02-erp-content-package.md` — package anatomy, ARA layers, fixture
  acquisition, review gates.

## Related Backlog Items

- `backlog/04-validation-evaluator.md` — validator consumes content-sdk loaders.
- `backlog/06-data-access-analytics.md` — package build mirroring into `stages`,
  `decision_nodes`, `branches`.

## Depends on

- `packages/erp-schema` — schema parsers and types.
