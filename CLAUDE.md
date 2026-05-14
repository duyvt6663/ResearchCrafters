## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## work lifecycle

Backlog files are the source of implementation work. Agents must follow the
exact transition order below unless the user explicitly asks to bypass it:

`experiment → backlog → backlog refinement → coding → qa → done`

Rules:
- Production coding starts from a `backlog/*.md` item, not directly from an
  experiment writeup or informal proposal.
- A backlog item is not automatic permission to code. Before implementation,
  perform a readiness check: read the linked docs, experiments, archive notes,
  prior QA reports, and the current code paths the item touches.
- If the backlog item is stale, ambiguous, too broad, missing acceptance
  criteria, or no longer matches the codebase, update the backlog first. Add
  current-state notes, explicit scope, non-goals, implementation sketch,
  validation commands, and QA expectations before coding.
- If the work needs scaffolding before production implementation, do that in
  the appropriate sandbox first: UX work in `apps/web/experiments/`, content
  or schema exploration in backlog notes/templates, and technical discovery in
  a narrow spike or test fixture. Fold the outcome back into the backlog item
  before starting production coding.
- If refinement shows the item is already done or superseded, do not recode it.
  Update the backlog status with evidence and move only the verification work
  into `qa/`.
- When coding from backlog is complete, move the work into the QA step before
  marking it done. Write or update a report in the top-level `qa/` folder with
  the scope, commands run, results, and remaining risks.
- If QA passes, update the relevant backlog checkbox/status and, when the
  change affects the integrated snapshot, update `backlog/PROGRESS.md`.
- If QA fails, record the failure in `qa/`, leave or add the failed work back
  in `backlog/` with reproduction notes, and do not mark it done.
- QA reports live at repo-root `qa/`, not under `backlog/`.

## experiments

UI/UX proposals must be sandboxed in `apps/web/experiments/` before they are
integrated into `packages/ui`, `apps/web/app/*`, or the content-package
schema. Each experiment is one folder with a writeup (`README.md`) and a
runnable mock (`Mock.tsx`), registered in
`apps/web/app/experiments/_registry.ts` and viewable at
`/experiments/<slug>` in the running web app.

When to use:
- **Before** proposing a non-trivial UX change to math / writing / coding
  workbenches, the stage flow, or any component in `packages/ui` that
  affects how learners interact. "Non-trivial" = anything beyond a copy
  tweak, a token-only style change, or a bugfix.
- When asked to *plan* a UX change, default to "scaffold an experiment
  first" and only skip the sandbox if the user explicitly opts out.
- After an experiment validates, move it into `backlog/` before production
  coding. Mark the experiment `backlog` in the registry, link the backlog item
  from the writeup, and implement only from that backlog item.
- When backlog implementation and QA pass, mark the experiment `promoted` in
  the registry and append a dated entry to the writeup's *Findings* section;
  do not delete the experiment folder.

Rules for an experiment:
- Slug format: `<module-code>-<short-name>` (e.g. `m1-symbol-palette`,
  `w1-claim-skeleton`, `c1-callgraph-overlay`).
- Mock must reuse `@researchcrafters/ui/components` and the
  `--color-rc-*` design tokens — never introduce a new production
  dependency just for a mock; inline SVG glyphs if needed.
- Stub APIs / graders / mentor calls — mocks prove *interaction*, not
  wiring.
- The writeup must follow `apps/web/experiments/TEMPLATE/README.md` and
  contain: Goal, Hypothesis, In/Out of scope, How to view, Manual test
  script, Validation criteria, append-only Findings, Decision,
  Integration sketch.
- Status lifecycle in the registry:
  `draft → validated → backlog → promoted → archived | dropped`.
  Mark the status on the registry entry, not in the writeup body — `git
  log` on `_registry.ts` is the audit trail.
- An experiment enters `backlog` when a matching `backlog/*.md` item exists.
  That backlog item still needs the readiness check above before coding:
  implementation scope, non-goals, integration sketch, and QA expectations
  must be current. It promotes only after that backlog item has shipped
  through QA. It archives when it's wired end-to-end — UI primitive +
  authoring schema (`packages/erp-schema`) + at least one stage YAML consuming
  it + stage-page routing. Archived experiments are moved to the repo-root
  `archive/<slug>/` folder and removed from the registry; the production
  component is the canonical reference from then on.

When the user requests a feature that matches an `apps/web/experiments/<slug>`
proposal — *or its archive twin under the repo-root `archive/`* —
read that writeup before writing code. If no matching backlog item exists,
create or update one first; do not code directly from the experiment. The
writeup captures hypotheses, deferred decisions, and the integration history
that the surrounding code does not.
