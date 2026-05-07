# Executable Research Package Specification

Last updated: 2026-05-07

## 1. Definition

An Executable Research Package (ERP) is the ResearchCrafters content unit. It is a
learning-oriented wrapper around an Agent-Native Research Artifact (ARA).

ARA answers: "What structured knowledge should replace the lossy PDF?"

ERP answers: "How should a learner practice with that knowledge until they can think and
work like a research engineer?"

An ERP must include the paper's canonical narrative, reconstructed research branches,
executable tasks, evidence, tests, rubrics, and mentor guidance.

## 2. ERP Principles

Knowledge over summary.

- Do not merely explain the paper. Preserve the problem, evidence, alternatives, failures,
  and implementation constraints.

Practice over consumption.

- Every important concept should become a decision, implementation, experiment, analysis,
  or writing task.

Evidence over vibes.

- Claims must link to experiments, logs, tables, figures, or source text. Inferred branches
  must be labeled as inferred.

Failure as curriculum.

- Failed and suboptimal branches are not side notes. They are often the highest-value
  learning material.

AI as mentor, not oracle.

- AI can hint, challenge, and explain. It should not silently grade correctness or replace
  expert-authored branch feedback.

## 3. Package Anatomy

Recommended package structure:

```text
content/packages/{paper-slug}/
  package.yaml
  README.md

  artifact/
    PAPER.md
    logic/
    src/
    trace/
    evidence/

  curriculum/
    graph.yaml
    stages/
      001-problem-framing.md
      002-core-decision.md
      003-implementation.md
    rubrics/
      claim-writing.yaml
      experiment-design.yaml
    hints/
      stage-001.yaml

  workspace/
    starter/
    tests/
    fixtures/
    docker/
    runner.yaml

  solutions/
    canonical/
    branches/
      branch-a-failed/
      branch-b-suboptimal/
      branch-c-success/

  media/
    diagrams/
    share-card/
```

The `artifact/` directory should stay close to ARA. The `curriculum/` and `workspace/`
directories are ResearchCrafters-specific.

## 4. Metadata Schema

`package.yaml` should define:

```yaml
slug: flash-attention
title: "FlashAttention: IO-Aware Exact Attention"
paper:
  title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness"
  authors: []
  year: 2022
  arxiv: ""
status: alpha # alpha | beta | live | archived
difficulty: advanced # beginner | intermediate | advanced | expert
estimated_time_minutes: 180
skills:
  - systems thinking
  - GPU memory hierarchy
  - experiment design
  - evidence-grounded writing
prerequisites:
  - Python
  - PyTorch basics
  - attention mechanism
release:
  free_stages: 2
  requires_gpu: false
review:
  expert_reviewer: ""
  last_reviewed_at: ""
```

## 5. Curriculum Graph

`curriculum/graph.yaml` describes the learner-facing graph.

```yaml
nodes:
  - id: N001
    type: framing
    title: "Why is attention slow?"
    stage: stages/001-problem-framing.md
    artifact_refs:
      - artifact/logic/problem.md#O01
    unlocks: [N002]

  - id: N002
    type: decision
    title: "Which bottleneck do you attack first?"
    stage: stages/002-core-decision.md
    choices:
      - id: cache-kv
        branch: branches/cache-kv.yaml
      - id: reduce-hbm-traffic
        branch: branches/reduce-hbm-traffic.yaml
    unlocks_by_choice:
      cache-kv: [N003A]
      reduce-hbm-traffic: [N003B]
```

Required node types:

- `framing`
- `math`
- `decision`
- `implementation`
- `experiment`
- `analysis`
- `writing`
- `review`
- `reflection`

## 6. Stage Format

Every stage should include:

```yaml
id: S001
title: "Frame the bottleneck"
type: framing
difficulty: very_easy # very_easy | easy | medium | hard
estimated_time_minutes: 10
artifact_refs:
  - artifact/logic/problem.md
task:
  prompt_md: |
    You are given a sequence length increase and a GPU memory profile.
    Identify the bottleneck that matters most.
inputs:
  mode: multiple_choice # multiple_choice | free_text | code | experiment | mixed
validation:
  kind: rubric # test | metric | rubric | hybrid
  rubric: curriculum/rubrics/problem-framing.yaml
hints:
  progressive: curriculum/hints/stage-001.yaml
feedback:
  canonical_md: ""
  common_misconceptions:
    - ""
```

Stage copy should follow the CodeCrafters pattern: hook, explanation, tests or rubric,
and notes. The first 2-3 stages should be intentionally lightweight so the learner reaches
the core loop quickly.

## 7. Branch Types

Each decision branch should be typed:

- `canonical`: the path matching the final paper or expert reconstruction.
- `failed`: a path that breaks, diverges, underperforms, or violates constraints.
- `suboptimal`: a path that works but is worse than the canonical path.
- `ambiguous`: a plausible branch with evidence tradeoffs rather than a single right answer.
- `extension`: a branch that goes beyond the paper and invites new work.

Branch fields:

```yaml
id: branch-recompute-attention
type: failed
support_level: inferred # explicit | inferred | expert_reconstructed
choice: "Recompute attention blocks naively"
expected_by_learner: "Lower memory use should improve long-sequence performance"
actual_outcome: "Compute overhead dominates before memory savings matter"
evidence_refs:
  - artifact/evidence/tables/...
lesson: "A memory-saving branch can still fail if it increases the wrong IO path."
next_nodes:
  - N004
```

## 8. ARA Compatibility Requirements

Every live ERP should include an ARA-compatible `artifact/` directory:

- `PAPER.md` as the root manifest and layer index.
- `logic/` for problem, claims, concepts, experiment plans, solution, and related work.
- `src/` for executable or stubbed implementation.
- `trace/` for the exploration tree.
- `evidence/` for raw proof: tables, figures, logs, and results.

ResearchCrafters can extend ARA, but should not erase its discipline:

- Source-supported items must cite source references.
- Reconstructed items must declare `support_level`.
- Claims must not exceed their evidence.
- Evidence must remain separate from interpretation.
- Dead ends must preserve the lesson learned.

## 9. Validation Layers

ERP quality should be validated in layers:

1. Structural validation: required files exist and schema parses.
2. ARA validation: cross-layer links resolve across claims, experiments, code, trace, and
   evidence.
3. Sandbox validation: tests run from a clean checkout.
4. Pedagogy validation: stages have clear tasks, progressive hints, and non-spoiler
   feedback.
5. Expert review: a qualified reviewer checks correctness, branch fairness, and evidence
   calibration.
6. Beta cohort review: early learners expose confusing stages and missing hints.

## 10. Authoring Workflow

Recommended authoring pipeline:

1. Select a paper with strong learning value and feasible miniature execution.
2. Gather sources: paper, official code, reproduction repos, talks, blogs, issue threads,
   experiment logs, and expert notes.
3. Compile the base ARA: logic, code, trace, evidence.
4. Reconstruct the research journey:
   - canonical path
   - failed paths
   - suboptimal paths
   - unresolved tradeoffs
5. Convert the journey into learner stages.
6. Build starter code, tests, fixtures, and cached evidence.
7. Write expert branch feedback and mentor context.
8. Run validation and expert review.
9. Release as alpha to a small cohort.
10. Promote to beta/live only after completion and confusion metrics are acceptable.

## 11. Moat

The moat is not the UI or the existence of paper summaries. The moat is the expert
reconstruction of research process:

- Which branches looked plausible at the time?
- Which failure modes were instructive?
- Which implementation details are easy to miss?
- Which results actually support each claim?
- Which writing moves make the contribution defensible?

Agent-assisted drafting can accelerate this work, but the final quality gate must remain
human expert review.

## 12. Package Quality Bar

A live ERP should be considered publishable only if:

- A learner can finish the first 2 stages in under 20 minutes.
- At least one meaningful branch teaches a failed or suboptimal decision.
- At least one stage requires implementation.
- At least one stage requires experiment or evidence interpretation.
- At least one stage requires writing a precise research claim.
- The package can be completed without expensive infrastructure.
- All AI mentor feedback is grounded in package context and does not reveal full answers
  before the learner attempts the task.
