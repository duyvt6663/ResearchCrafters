# apps/runner/docker

Dockerfiles and image manifests for the sandbox runner.

Per `TODOS/08-infra-foundations.md`:

- Minimal Python base image for `test` and `replay`.
- Python base image with common ML libs for `mini_experiment`.
- Pin all images by digest, not tag.
- Run image scans in CI; reject high-severity CVEs.
- Strip secrets and shell history.
