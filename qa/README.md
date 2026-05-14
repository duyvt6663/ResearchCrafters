# QA Reports

This folder is the repo-root QA step for work coming out of `backlog/`.

## Workflow

Backlog work follows:

`backlog → backlog refinement → coding → qa → done`

- Create or update one focused report per QA pass.
- Include the backlog item or experiment slug, scope tested, commands run,
  pass/fail result, and remaining risks.
- If QA finds that the backlog item was stale, underspecified, or only partially
  implemented, record that here and reopen/refine the backlog item with
  reproduction notes and updated acceptance criteria.
- If QA passes, link the report from the relevant backlog notes when useful and
  mark the backlog item complete.
- If QA fails, keep the report here, add or reopen the failed item in
  `backlog/`, and include reproduction notes.

UX experiments follow:

`experiment → backlog → backlog refinement → coding → qa → promoted`

Validated experiments must have a matching backlog item before production code
starts. That backlog item may need refinement or scaffolding before coding. The
QA report validates the backlog implementation, not just the mock.
