# packages/cli

The `researchcrafters` binary. One binary hosts learner and author subcommands;
the surface is split by role per `TODOS/03-cli-runner.md`.

Learner commands: `login`, `logout`, `start`, `test`, `submit`, `status`, `logs`.
Author commands: `validate`, `preview`, `build`.

## Primary TODO

- `TODOS/03-cli-runner.md` — full command surface, OAuth device-code flow,
  submission bundling, error UX, distribution.

## Related TODOs

- `TODOS/04-validation-evaluator.md` — `validate` subcommand layer 1-4 checks.
- `TODOS/08-infra-foundations.md` — auth foundations and signed URL helpers.

## Depends on

- `packages/erp-schema` — schemas used by `validate`.
- `packages/content-sdk` — package and workspace resolution.
