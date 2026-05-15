# ERP Agent

Local authoring accelerator for reconstructing papers into draft Executable
Research Packages. This first slice intentionally stops at the local app
skeleton: input normalization, run manifests, template-backed package drafts,
validation reports, and resumable side effects.

The generated package source under `content/packages/<slug>/` is the canonical
output. Run folders under `.researchcrafters/erp-agent/runs/<run_id>/` are
audit trails, not a second package format.

## Commands

```sh
PYTHONPATH=apps/erp-agent/src python3 -m researchcrafters_erp_agent.cli plan \
  --input 1706.03762 \
  --slug attention-draft

pnpm --filter @researchcrafters/cli... build

PYTHONPATH=apps/erp-agent/src python3 -m researchcrafters_erp_agent.cli create \
  --input 1706.03762 \
  --slug attention-draft

PYTHONPATH=apps/erp-agent/src python3 -m researchcrafters_erp_agent.cli resume \
  --run-id <run_id>
```

To install an editable local command instead:

```sh
python3 -m pip install -e apps/erp-agent
erp-agent plan --input 1706.03762 --slug attention-draft
```

`create` runs validation by default. The default validation command uses
`packages/cli/bin/researchcrafters.js`, so the CLI and its workspace
dependencies must be built first. Pass `--skip-validate` only for isolated
scaffold tests.

## Product Boundary

- Accepted inputs: arXiv ids, arXiv URLs, paper/project URLs, direct PDF URLs,
  and local PDF paths.
- Generated packages always start at `status: alpha`.
- The first implementation is local only. It does not enqueue internal worker
  jobs or publish packages.
- Source caches live under `.researchcrafters/erp-agent/cache`; run-specific
  artifacts live under `.researchcrafters/erp-agent/runs/<run_id>/`.
- Source excerpts must be summarized or cited. The agent report treats copied
  passages and unsupported claims as human review blockers.
- Validation shells out to the existing ResearchCrafters CLI instead of
  reimplementing the TypeScript validators.

## Configuration

Defaults are shown in `config.example.toml`. Every path is resolved relative to
the repo root unless absolute.

Environment overrides:

- `ERP_AGENT_MODEL_PROVIDER`
- `ERP_AGENT_SEARCH_PROVIDER`
- `ERP_AGENT_RUN_ROOT`
- `ERP_AGENT_CACHE_ROOT`
- `ERP_AGENT_PACKAGE_ROOT`
- `ERP_AGENT_TEMPLATE_PATH`
- `ERP_AGENT_VALIDATION_COMMAND`
- `ERP_AGENT_MAX_SOURCE_COUNT`
- `ERP_AGENT_MAX_REPAIR_ITERATIONS`

`ERP_AGENT_VALIDATION_COMMAND` may include `{package_path}` and `{repo_root}`
placeholders. If no package placeholder is present, the agent appends
`<package_path> --json`.
