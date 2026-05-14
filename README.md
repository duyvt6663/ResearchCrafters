# ResearchCrafters

ResearchCrafters is a CodeCrafters-style learning platform for AI engineers. Learners work through **Executable Research Packages (ERPs)** — structured, executable wrappers around landmark AI papers — practicing implementation, experiment design, evidence interpretation, and research writing in a local-first, test-driven loop.

---

## System Architecture

```
                        ┌──────────────────────────────────────────────┐
                        │               Learner Browser                │
                        │  Catalog · Session Player · Decision Graph   │
                        │  Stage Instructions · Share Cards · Paywall  │
                        └────────────────────┬─────────────────────────┘
                                             │ HTTPS
                        ┌────────────────────▼─────────────────────────┐
                        │            apps/web  (Next.js)               │
                        │  Route handlers · Auth · Entitlement checks  │
                        └──────┬──────────────────────┬────────────────┘
                               │ Prisma               │ BullMQ jobs
               ┌───────────────▼──────┐   ┌───────────▼──────────────┐
               │  Postgres            │   │  Redis / Valkey           │
               │  Users · Enrollments │   │  Submission queue         │
               │  Grades · Analytics  │   │  Mentor jobs              │
               └──────────────────────┘   └───────────┬──────────────┘
                                                       │
                        ┌──────────────────────────────▼───────────────┐
                        │          apps/runner  (Docker-isolated)      │
                        │  test · replay · mini_experiment modes       │
                        │  Strict CPU / memory / network limits        │
                        └──────────────┬───────────────────────────────┘
                                       │ artifacts → S3-compatible storage
                        ┌──────────────▼───────────────────────────────┐
                        │         packages/evaluator-sdk               │
                        │  Rubric grading · LLM grading guardrails     │
                        │  Redaction · Evidence-link enforcement       │
                        └──────────────────────────────────────────────┘

                        ┌──────────────────────────────────────────────┐
                        │           packages/ai  (AI Mentor)           │
                        │  Package-grounded context builder            │
                        │  LLM gateway · stage_policy gates            │
                        │  Leak tests · Cost controls                  │
                        └──────────────────────────────────────────────┘

                        ┌──────────────────────────────────────────────┐
                        │     Learner Local Workspace  (packages/cli)  │
                        │  researchcrafters login / start / test /     │
                        │  submit / status                             │
                        └──────────────────────────────────────────────┘
```

### Core Services

| Service         | Package / App            | Responsibility                                                                                  |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| **Web App**     | `apps/web`               | Catalog, session player, decision graph, share cards, paywall, authoring preview                |
| **CLI**         | `packages/cli`           | Auth, workspace init, local smoke checks, submission bundling, log streaming                    |
| **Runner**      | `apps/runner`            | Execute untrusted learner code in isolated Docker containers; produce raw test/metric artifacts |
| **Evaluator**   | `packages/evaluator-sdk` | Map runner artifacts to structured grades via rubrics; LLM grading with redaction guardrails    |
| **AI Mentor**   | `packages/ai`            | Package-grounded hints and writing feedback; enforces `stage_policy` visibility gates           |
| **DB**          | `packages/db`            | Prisma schema, migrations, and typed client over Postgres                                       |
| **ERP Schema**  | `packages/erp-schema`    | Zod/JSON schemas for package, graph, stage, branch, rubric, and runner config                   |
| **Content SDK** | `packages/content-sdk`   | Package loader, ARA cross-link helpers, package build utilities                                 |
| **UI**          | `packages/ui`            | Shared components, design tokens, copy library                                                  |

### Tech Stack

| Layer         | Choice                                          |
| ------------- | ----------------------------------------------- |
| Language      | TypeScript throughout                           |
| Monorepo      | pnpm + Turborepo                                |
| Web           | Next.js + React                                 |
| UI            | Tailwind CSS + Radix/shadcn primitives          |
| Graph UI      | React Flow                                      |
| Database      | Postgres (JSONB for package metadata)           |
| ORM           | Prisma                                          |
| Queue         | Redis/Valkey + BullMQ                           |
| Storage       | S3-compatible object storage                    |
| Runner        | Docker-isolated containers (gVisor / E2B later) |
| Auth          | GitHub OAuth + email                            |
| Payments      | Stripe                                          |
| AI            | Provider-agnostic LLM gateway                   |
| Observability | OpenTelemetry + structured logs                 |
| Analytics     | PostHog                                         |

### Content — Executable Research Packages (ERPs)

Each ERP lives in `content/packages/{slug}/` and bundles:

```
{slug}/
  package.yaml          # metadata, skills, prereqs, release policy
  artifact/             # ARA: PAPER.md, logic, src, trace, evidence
  curriculum/           # graph.yaml, stages, rubrics, hints
  workspace/            # starter code, tests, fixtures, runner.yaml
  solutions/            # canonical solution + branch solutions
  media/                # diagrams, share-card assets
```

The runner executes learner submissions against stage tests or cached fixtures. The evaluator then maps raw outputs to rubric scores. The AI mentor provides grounded hints without revealing answers, controlled by per-stage `stage_policy` visibility gates.

### Key Learner Flow

```
1. Browse catalog → enroll → pin package version
2. Clone starter workspace via CLI
3. Work locally → researchcrafters test (smoke)
4. researchcrafters submit → bundle → queue → Runner
5. Runner executes in isolation → artifacts → S3
6. Evaluator grades artifacts → structured grade → Postgres
7. Web app shows feedback, branch stats, share card
8. AI Mentor available for hints at any stage (policy-gated)
```

---

## Repo Layout

```
.
├── apps/        # runnable services (web, runner)
├── packages/    # shared libraries (db, cli, ui, ai, evaluator-sdk, content-sdk, erp-schema, config)
├── content/     # versioned ERPs and authoring templates (content/packages, content/templates)
├── infra/       # docker, terraform, ops scripts
├── docs/        # product, technical, and design specs
├── qa/          # validation reports for backlog work
└── backlog/     # workstream execution plans
```

A folder-by-folder map lives in [`SCAFFOLD.md`](./SCAFFOLD.md).

---

## Quickstart

Prereqs: Node 20.18 (see `.nvmrc`), pnpm 9, Docker with `docker compose` v2.

```sh
./infra/scripts/bootstrap.sh
pnpm dev
```

`bootstrap.sh` copies `.env.example` to `.env`, installs dependencies, brings up the dev tier (Postgres + Redis + MinIO via `docker-compose.yml`), and generates the Prisma client. Once the baseline migration lands, follow the "next steps" message it prints to run migrations + seed.

---

## Common Commands

```sh
pnpm typecheck                                                          # type-check every workspace
pnpm test                                                               # run vitest across the repo
pnpm --filter @researchcrafters/db db:migrate                           # apply Prisma migrations against $DATABASE_URL
pnpm --filter @researchcrafters/cli exec researchcrafters validate ./content/packages/resnet
                                                                        # validate the flagship ERP
```

CI runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, and a `researchcrafters validate` sweep over every directory in `content/packages/` on each push and pull request to `main`. See `.github/workflows/ci.yml`.

---

## Status

Live snapshot of what's built, stubbed, and outstanding: [`backlog/PROGRESS.md`](./backlog/PROGRESS.md). Per-workstream plans live alongside it in `backlog/`; validation reports live in [`qa/`](./qa/).

---

## Shared Drive

Team materials (references, assets, research notes) are stored in our shared Google Drive:

[ResearchCrafters Shared Drive](https://drive.google.com/drive/folders/1WJHvduQbKjyLltkeJSIwVDuixdWEdqbW?usp=drive_link)

---

## Specs

- Product brief — [`docs/PRD.md`](./docs/PRD.md)
- Product brief v2 — [`docs/PRD_v2.md`](./docs/PRD_v2.md)
- Technical spec — [`docs/TECHNICAL.md`](./docs/TECHNICAL.md)
- Frontend design — [`docs/FRONTEND.md`](./docs/FRONTEND.md)
- Marketing plan — [`docs/MARKETING.md`](./docs/MARKETING.md)
