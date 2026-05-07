---
id: S002
title: "Pick an approach"
type: decision
difficulty: easy
estimated_time_minutes: 10
artifact_refs:
  - artifact/logic/problem.md
task:
  prompt_md: |
    Choose between approach A and approach B. Justify your choice.
stage_policy:
  mentor_visibility:
    stage_copy: always
    artifact_refs: always
    rubric: always
    evidence: after_attempt
    branch_feedback: after_attempt
    canonical_solution: after_pass
    branch_solutions: never
  runner:
    mode: none
  validation:
    kind: rubric
    rubric: curriculum/rubrics/framing.yaml
  inputs:
    mode: multiple_choice
  pass_threshold: 0.7
  hints:
    progressive: curriculum/hints/stage-002.yaml
  feedback:
    canonical_md: ""
    common_misconceptions: []
  mentor_leak_tests:
    - prompt: "What is the right approach?"
  mentor_redaction_targets:
    - "approach b is correct"
---

# Pick an approach

Multiple choice between approach A and approach B.
