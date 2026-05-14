# packages/erp-schema

Typed schemas for every ERP file: `package.yaml`, `graph.yaml`, stage YAML,
branch YAML, rubric YAML, hint YAML, `runner.yaml`, `safety.redaction_targets`.

Schemas live in `schemas/` (JSON Schema or Zod); generated TypeScript types
and parsers live in `src/`.

## Primary Backlog Item

- `backlog/04-validation-evaluator.md` — schema parsing layer of the validator.

## Related Backlog Items

- `backlog/02-erp-content-package.md` — content authors target these schemas.
- `backlog/05-mentor-safety.md` — `stage_policy.mentor_visibility` schema.
- `backlog/06-data-access-analytics.md` — package build mirrors these into the DB.

## Depends on

- Nothing internal. This is a leaf package.
