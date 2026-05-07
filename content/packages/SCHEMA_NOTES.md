# ERP Schema Notes (canonical authoring shape)

Zod schemas under `packages/erp-schema/src/schemas/*` are the source of truth.

## 1. Stage YAML layout

Authors write the PRD §6 top-level shape. Only `mentor_visibility` lives under
`stage_policy`. The schema lifts top-level fields into `stage_policy` at parse,
so downstream code keeps reading them under `stage_policy.*`.

```yaml
id: S001
title: "Frame the question"
type: framing             # framing|math|decision|implementation|experiment|analysis|writing|review|reflection
difficulty: very_easy     # very_easy|easy|medium|hard
estimated_time_minutes: 10
artifact_refs:
  - artifact/logic/problem.md            # plain file path
  - artifact/logic/claims.md#anchor      # optional fragment
task: { prompt_md: "..." }

# Top-level (PRD §6 layout):
inputs: { mode: free_text }              # multiple_choice|free_text|code|experiment|mixed
validation: { kind: rubric, rubric: curriculum/rubrics/foo.yaml }
runner: { mode: none, config: workspace/runner.yaml }
pass_threshold: 0.6                      # required when any visibility uses after_pass
hints: { progressive: curriculum/hints/stage-001.yaml }
feedback: { canonical_md: "...", common_misconceptions: [...] }
mentor_redaction_targets: [...]
mentor_leak_tests: [{ prompt: "..." }]

# Mandatory under stage_policy:
stage_policy:
  mentor_visibility:
    stage_copy: always
    artifact_refs: always
    rubric: after_attempt
    evidence: always
    branch_feedback: after_attempt
    canonical_solution: after_pass
    branch_solutions: never
```

The pre-existing nested form (everything under `stage_policy.*`) still parses
unchanged — old fixtures keep working.

## 2. Difficulty vocabulary split

| Field | Vocabulary | Why |
|---|---|---|
| `package.difficulty` | `beginner|intermediate|advanced|expert` (PRD §4) | Catalog axis: how hard is the whole journey? |
| `stage.difficulty` | `very_easy|easy|medium|hard` (PRD §6) | Pacing axis: how hard is this stage relative to its neighbours? |

`package.difficulty` also accepts the stage vocabulary for backwards
compatibility with older fixtures.

## 3. Runner command + resource fields

- `runner.stages.<id>.command` accepts a string (`"pytest -q"`) **or** a string
  array (`["pytest", "-q"]`); arrays are normalized to a space-joined string.
  This keeps `apps/runner`'s `parseCommand` contract stable.
- `command` is **required** when `mode` is `test|replay|mini_experiment`,
  **optional** when `mode: none`.
- `wall_clock_seconds` is canonical. `timeout_seconds` is rejected at parse
  time with a clear message — pasting shell-style configs used to silently
  disable timeouts.

## 4. Free stages

`package.release.free_stage_ids` is the explicit list (`["S001", "S002"]`).
The legacy `free_stages: 2` count is allowed but ignored.

## 5. Source of truth

Source schemas: `packages/erp-schema/src/schemas/{package,stage,runner,branch,rubric,hint,graph}.ts`.

Cross-package contracts that must stay stable: `MentorVisibilityState`,
`runner-mode`, `branch-type`, `support-level`, `validation-kind`, `stage-type`,
`input-mode`, status enums, plus the `Issue` and `ValidationReport` shapes
produced by `@researchcrafters/content-sdk`.
