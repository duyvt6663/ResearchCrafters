# ResearchCrafters

ResearchCrafters monorepo — CodeCrafters-style executable research packages for AI engineers.

## Layout

```
.
├── apps/        # runnable services (web, runner)
├── packages/    # shared libraries (db, cli, ui, ai, evaluator-sdk, content-sdk, erp-schema, config)
├── content/     # versioned ERPs and authoring templates (content/packages, content/templates)
├── infra/       # docker, terraform, ops scripts
├── docs/        # product, technical, and design specs
└── TODOS/       # workstream execution plans
```

A folder-by-folder map lives in [`SCAFFOLD.md`](./SCAFFOLD.md).

## Quickstart

Prereqs: Node 20.18 (see `.nvmrc`), pnpm 9, Docker with `docker compose` v2.

```sh
./infra/scripts/bootstrap.sh
pnpm dev
```

`bootstrap.sh` copies `.env.example` to `.env`, installs dependencies, brings up the dev tier (Postgres + Redis + MinIO via `docker-compose.yml`), and generates the Prisma client. Once the baseline migration lands, follow the "next steps" message it prints to run migrations + seed.

## Common commands

```sh
pnpm typecheck                                                          # type-check every workspace
pnpm test                                                               # run vitest across the repo
pnpm --filter @researchcrafters/db db:migrate                           # apply Prisma migrations against $DATABASE_URL
pnpm --filter @researchcrafters/cli exec researchcrafters validate ./content/packages/resnet
                                                                        # validate the flagship ERP
```

CI runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a `researchcrafters validate` sweep over every directory in `content/packages/` on each push and pull request to `main`. See `.github/workflows/ci.yml`.

## Status

Live snapshot of what's built, stubbed, and outstanding: [`TODOS/PROGRESS.md`](./TODOS/PROGRESS.md). Per-workstream plans live alongside it in `TODOS/`.

## Specs

- Product brief — [`docs/PRD.md`](./docs/PRD.md)
- Product brief v2 — [`docs/PRD_v2.md`](./docs/PRD_v2.md)
- Technical spec — [`docs/TECHNICAL.md`](./docs/TECHNICAL.md)
- Frontend design — [`docs/FRONTEND.md`](./docs/FRONTEND.md)
- Marketing plan — [`docs/MARKETING.md`](./docs/MARKETING.md)
