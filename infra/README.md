# infra/

Operational scaffolding: container images, IaC, scripts.

- `docker/` — application Dockerfiles (web, runner build artifacts).
- `terraform/` — environment, networking, queue, storage, runner pool.
- `scripts/` — bootstrap, seed, deploy, runbooks.

## Primary TODO

- `TODOS/08-infra-foundations.md` — environments, DB, queue, storage, runner
  base images, secrets, observability, CI/CD, privacy foundations, SLO targets.

## Related TODOs

- `TODOS/03-cli-runner.md` — runner image content and security posture.
- `TODOS/06-data-access-analytics.md` — DB provisioning and retention policies.
