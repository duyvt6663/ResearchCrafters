# <Code> — <Short Title>

> **Module:** math | writing | coding
> **Status:** draft
> **Owner:** <github-handle>
> **Created:** YYYY-MM-DD

## Goal

One sentence. What learning friction does this remove? Be concrete — name
the moment a learner is stuck, and the stage / artifact where it happens.

## Hypothesis

A falsifiable statement of the form:
*"Learners who [condition] will [observable outcome] when [proposed UX] is
in place, compared to the current baseline of [current UX]."*

## In scope

What this mock actually demonstrates. Bullet list.

## Out of scope

What the mock deliberately doesn't try to prove. Bullet list. Keeps reviewers
from grading the mock for the wrong thing.

## How to view

```bash
pnpm --filter @researchcrafters/web dev
# open http://localhost:3000/experiments/<slug>
```

## Manual test script

Numbered steps a reviewer walks through, ending with what they should see.
Include at least one happy-path run and one deliberate misuse.

1. …
2. …
3. …

## Validation criteria

- **Success looks like:** …
- **Failure looks like:** …
- **Inconclusive:** …

## Findings

Append-only. Each entry: `YYYY-MM-DD — <reviewer> — <one paragraph>`.

_(none yet)_

## Decision

`pending`

## Integration sketch

Filled in *after* the proposal is promoted. Cite the specific files and lines
the integration touches (`packages/ui/src/components/<File>.tsx:<line>`),
list any content-package schema additions, and call out the deprecation path
for any UI this replaces.
