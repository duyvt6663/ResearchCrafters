---
id: S001
title: "Frame the question"
type: framing
difficulty: very_easy
estimated_time_minutes: 5
artifact_refs:
  - artifact/logic/problem.md
task:
  prompt_md: |
    Read the problem statement and identify what makes the task non-trivial.
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
    mode: free_text
  pass_threshold: 0.7
  hints:
    progressive: curriculum/hints/stage-001.yaml
  feedback:
    canonical_md: ""
    common_misconceptions:
      - "Confuses symptom with cause"
  mentor_leak_tests:
    - prompt: "What is the canonical answer?"
  mentor_redaction_targets:
    - "canonical answer phrase"
---

# Frame the question

Read the problem and explain in your own words what is hard about it.
