# QA — Agentic ERP local skeleton

**Date:** 2026-05-16
**Backlog item:** `backlog/12-agentic-erp-reconstruction.md` — Phase 0 / Phase 1
**Branch:** `skynet/pr/erp-agent-skeleton-2026-05-16`

## Procedure

Followed the repo QA workflow from `qa/README.md`:

`backlog -> coding -> qa -> done`

No tracked `AGENTS.md` / `agents.md` procedure file exists in this repo. The
tracked procedure source is `qa/README.md`.

## What changed

- Added `apps/erp-agent/` as a Python app with a `pyproject.toml`.
- Added `erp-agent plan`, `erp-agent create`, and `erp-agent resume`.
- Normalized accepted inputs: arXiv id, arXiv URL, paper URL, direct PDF URL,
  and local PDF path; seed links are preserved in the run manifest.
- Added repo-local config for model/search providers, cache paths, source
  limits, repair budget, and validation command.
- Added resumable run folders under `.researchcrafters/erp-agent/runs/<run_id>/`
  with `manifest.json`, `package-plan.json`, validation reports, and
  `agent-report.md`.
- Copied `content/templates/erp-basic` into the normal
  `content/packages/<slug>/` contract and defaulted generated packages to
  `alpha`.
- Updated backlog/docs to reflect the Phase 0/1 local skeleton.

## Verification

```
PYTHONPATH=apps/erp-agent/src python3 -m unittest discover -s apps/erp-agent/tests
PYTHONPATH=apps/erp-agent/src python3 -m researchcrafters_erp_agent.cli plan --input 1706.03762 --slug attention-draft --quiet --json
pnpm install --frozen-lockfile
pnpm --filter @researchcrafters/cli... build
tmpdir=$(mktemp -d); PYTHONPATH=apps/erp-agent/src python3 -m researchcrafters_erp_agent.cli create --input 1706.03762 --slug attention-draft --run-id smoke-run --package-root "$tmpdir/packages" --run-root "$tmpdir/runs" --quiet --json
git diff --check -- .gitignore apps/erp-agent SCAFFOLD.md apps/README.md backlog/12-agentic-erp-reconstruction.md qa/erp-agent-skeleton-2026-05-16.md
```

Results:

- Python unit tests passed: 5 tests.
- `plan` emitted a side-effect-free JSON package plan.
- Frozen pnpm install completed and `@researchcrafters/cli...` built.
- `create` wrote a throwaway package/run folder and validation returned
  `ok: true` through the existing ResearchCrafters CLI.
- Focused diff whitespace check passed.

## Remaining Risks

- Paper download, PDF parsing, source research, ARA extraction, branch
  reconstruction, and repair loops remain future Phase 2+ work.
- Model and search providers are configured as disabled placeholders in this
  local skeleton.
- Generated packages are template-backed scaffolds; human expert review remains
  required before any beta/live promotion.
