# Logs

Raw training logs are not redistributed inside the package because they are
verbose, environment-specific, and not learner-facing. Instead the package
records:

- The condensed JSON fixture at
  `workspace/fixtures/stage-004/training_log.json`, which is what
  replay-mode stages consume.
- Provenance metadata in `workspace/fixtures/README.md`: hardware, command,
  environment, git SHA, and date.
- A SHA-256 hash of the fixture in `workspace/runner.yaml`, enforced by the
  runner before stage `S004` executes.

If a future evidence claim needs the raw log, the maintainer regenerates the
log following the recipe in `workspace/fixtures/README.md` and uploads it to
fixture storage outside this repo.
