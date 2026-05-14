# UX Experiments

Sandbox for **UI/UX proposals that have not been integrated yet**. Each
experiment lives in its own folder under `apps/web/experiments/<slug>/` with
a writeup (`README.md`) and a runnable mock (`Mock.tsx`). The mocks are
rendered live by the web app at `/experiments/<slug>` so reviewers can poke
at them in a real browser alongside the actual product styling.

> The folder is colocated with `apps/web/` (rather than at the repo root) so
> mocks can import `react`, `@researchcrafters/ui`, and other web-app
> dependencies without a separate workspace package.
>
> The mocks are intentionally *not* wired into the production user flow.
> They exist to validate an idea before it earns the cost of integration
> into `packages/ui`, `apps/web/app/*`, or the content-package schema.

## Workflow

1. **Propose.** Copy `TEMPLATE/` to `<slug>/` (slug format: `<module-code>-<short-name>`,
   e.g. `m1-symbol-palette`, `w1-claim-skeleton`, `c1-callgraph-overlay`).
2. **Mock.** Write the smallest interactive `Mock.tsx` that lets a reviewer
   *feel* the proposal. No new production deps — reuse `@researchcrafters/ui`.
   Mocks may stub out grading / persistence / mentor calls.
3. **Register.** Add the experiment to
   `apps/web/app/experiments/_registry.ts` (one entry, static import).
4. **Validate.** View at `/experiments/<slug>` (`pnpm --filter @researchcrafters/web dev`).
   Run the manual test script in your writeup. Capture findings in the
   *Validation* section of your `README.md` (append, don't overwrite — keep
   the audit trail).
5. **Decide.** Update the `status:` field in `_registry.ts` to one of:
   - `draft` — still being built / not ready for review
   - `validated` — informally tested, idea is sound, ready for backlog
     shaping
   - `backlog` — a matching `backlog/*.md` item exists with implementation
     scope, owner notes, and QA expectations. Production coding starts from
     that backlog item, not from this experiment folder.
   - `promoted` — the backlog implementation shipped through QA and primitives
     landed in `packages/ui`; opt-in via a prop or mode field. Mock kept in
     the registry as a live demo of the integrated component.
   - `archived` — fully wired end-to-end (UI + content schema + at least one
     real stage YAML + stage-page routing). Folder moved to the repo-root
     `archive/<slug>/`; registry entry removed; the production component is
     now the canonical reference. The writeup survives as the historical
     record. See **Archiving an experiment** below for the exact steps.
   - `dropped` — tried it, didn't pan out (writeup explains why).

## Writeup contract

Every `<slug>/README.md` MUST contain these sections (in this order):

- **Goal** — one sentence: what learning friction does this remove?
- **Hypothesis** — falsifiable statement we'd hold to.
- **In scope / out of scope** — what the mock actually proves vs. defers.
- **How to view** — `pnpm dev` and the URL.
- **Manual test script** — the exact sequence a reviewer should walk through.
- **Validation criteria** — what counts as "this works" / "this doesn't".
- **Findings** — append-only log of review sessions (date, who, what they
  noticed). Empty at first.
- **Decision** — `pending` until validation is done; then `backlog | iterate | drop` + rationale.
- **Integration sketch** — *if moved to backlog*, where in the codebase it is
  expected to land, what schema changes the content package needs, and what
  QA report should validate. Cite file paths and line numbers, not
  abstractions.

## Why these constraints

- **One folder per experiment** keeps reviews scoped — a PR that touches three
  mocks is three reviews, not one bundle.
- **Mock.tsx imported via `@experiments/*` alias** (see `apps/web/tsconfig.json`)
  means the Next.js bundler picks the mock up automatically. No build step.
- **Status lives in the registry, not in the writeup**, so a quick `git log`
  on `_registry.ts` shows the lifecycle of every proposal.
- **Validated means backlog next.** Experiments do not jump straight into
  production coding. They become backlog work first, then move through
  coding and `qa/`.
- **Findings are append-only.** When an idea gets dropped six months in, the
  writeup remembers why so we don't re-propose it from scratch.

## Archived experiments

Archived experiments live at the repo root under `archive/<slug>/`. Their
writeups are preserved (read them before re-proposing similar ideas — the
Findings log often explains *why* a path was taken). The mocks are
intentionally not reachable at `/experiments/<slug>`; the production
components in `packages/ui` and their consumers in `apps/web/app/*` are the
canonical demonstration of the idea once it's integrated.

## Archiving an experiment

Run these steps in a single commit so the registry never imports a folder
that has already moved:

1. **Update the writeup.** Append a dated `Findings` entry summarising the
   integration outcome, flip the front-matter `Status` to `archived` + add
   an `Archived: YYYY-MM-DD` line, set `Decision` to `promote → archived`,
   and fill the *Integration sketch* with the real production touch points
   (file paths, prop names — not abstractions).
2. **Drop the registry entry** in `apps/web/app/experiments/_registry.ts`.
   Remove both the `import` line at the top and the entry inside
   `experiments`. With the slug gone from `experimentSlugs`, the
   `/experiments/<slug>` route 404s automatically.
3. **Move the folder** from `apps/web/experiments/<slug>/` to the
   repo-root `archive/<slug>/`. Use `git mv` when the folder is tracked
   so `git log --follow` keeps working on the writeup.

Archived folders are *not* typechecked or bundled — the `@experiments/*`
alias and the experiments tsconfig include only cover
`apps/web/experiments/`, so a future breaking change in `packages/ui`
won't fail the build over a mock that drifted out of sync with current
types.

## Currently registered

See `apps/web/app/experiments/_registry.ts` for the live list, or visit
`/experiments` in the running web app.
