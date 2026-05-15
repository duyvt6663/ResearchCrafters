# Agent Procedure

This file is the repo-local memory for coding agents working in
ResearchCrafters.

## Start of Work

- Run `git status --short` before changing files.
- If the current worktree has unrelated dirty changes, do not mix them into
  your task. Use a clean branch or a separate `git worktree` for PR work.
- Read the relevant backlog item in `backlog/` before implementing.
- Prefer existing repo contracts over new abstractions:
  - ERP content lives under `content/packages/<slug>/`.
  - ERP schema contracts live in `packages/erp-schema`.
  - Package validation/build behavior lives in `packages/content-sdk` and
    `packages/cli`.

## Required Flow

Backlog work follows the procedure in `qa/README.md`:

`backlog -> coding -> qa -> done`

For each backlog implementation:

- Code the smallest coherent slice that satisfies the selected backlog items.
- Add or update tests at the appropriate scope.
- Create or update one focused QA report in `qa/`.
- Include the backlog item, scope tested, commands run, pass/fail result, and
  remaining risks.
- If QA passes, mark the completed backlog checkboxes and mention the QA report
  when useful.
- If QA fails, keep the QA report, add or reopen the failed item in `backlog/`,
  and include reproduction notes.

## Verification

- Run focused tests first.
- Run package-specific validation when content package behavior changes.
- For CLI validation from a fresh checkout, build the CLI dependency chain:

```sh
pnpm install --frozen-lockfile
pnpm --filter @researchcrafters/cli... build
```

- Before committing, run a focused whitespace check over touched files:

```sh
git diff --check -- <touched paths>
```

## PR Handoff

- Stage only files that belong to the task.
- Commit with a concise conventional message.
- Push a task branch named like `skynet/pr/<topic>-YYYY-MM-DD`.
- Open a PR against `main`.
- PR body should include:
  - Summary of changes.
  - QA commands and results.
  - Known remaining risks or out-of-scope items.
- After opening the PR, check whether required CI is pending, passing, or
  failing and report the state.

## Do Not

- Do not revert unrelated user or agent changes.
- Do not promote generated ERP packages beyond `alpha` without explicit human
  release approval.
- Do not bypass `researchcrafters validate` for package release decisions.
