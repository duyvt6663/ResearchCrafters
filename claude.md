# Claude Procedure

Claude agents should follow the same repository procedure as `agents.md`.

## Core Workflow

Backlog work follows:

`backlog -> coding -> qa -> done`

Use `qa/README.md` as the authoritative QA procedure:

- Create or update one focused report per QA pass.
- Include the backlog item or experiment slug, scope tested, commands run,
  pass/fail result, and remaining risks.
- If QA passes, link the report from the relevant backlog notes when useful and
  mark the backlog item complete.
- If QA fails, keep the report, add or reopen the failed item in `backlog/`,
  and include reproduction notes.

## Working Rules

- Start with `git status --short`.
- Keep unrelated dirty worktree changes out of your task.
- Use a clean branch or `git worktree` when preparing a PR.
- Prefer `rg` for repo searches.
- Keep edits scoped to the backlog item.
- Preserve ResearchCrafters contracts:
  - `content/packages/<slug>/` is canonical ERP package source.
  - `packages/erp-schema` and `packages/content-sdk` are hard contracts.
  - Validation should call the existing CLI/SDK rather than duplicating it.

## QA and PR

- Run focused tests and validation before committing.
- Add a QA report under `qa/`.
- Stage only task-owned files.
- Commit, push, and open a PR against `main`.
- Include summary, QA commands/results, and residual risks in the PR body.
- Report CI state after the PR is opened.
