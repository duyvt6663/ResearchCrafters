# QA Reports

This folder is the repo-root QA step for work coming out of `backlog/`.

## Workflow

Backlog work follows:

`backlog → coding → qa → done`

- Create or update one focused report per QA pass.
- Include the backlog item or experiment slug, scope tested, commands run,
  pass/fail result, and remaining risks.
- If QA passes, link the report from the relevant backlog notes when useful and
  mark the backlog item complete.
- If QA fails, keep the report here, add or reopen the failed item in
  `backlog/`, and include reproduction notes.

UX experiments follow:

`experiment → backlog → coding → qa → promoted`

Validated experiments must have a matching backlog item before production code
starts. The QA report validates the backlog implementation, not just the mock.
