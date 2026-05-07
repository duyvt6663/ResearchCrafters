# ResearchCrafters PRD

Last updated: 2026-05-07

## 1. Product Thesis

ResearchCrafters is a CodeCrafters-style training platform for AI research engineering.
Instead of rebuilding Redis or SQLite, learners replay and extend famous research papers
through expert-crafted Executable Research Packages (ERPs).

The core product is not a paper reader, code sandbox, benchmark site, or research OS. It is
a structured practice environment for developing research taste: framing problems, making
technical decisions, implementing methods, designing experiments, interpreting evidence,
and writing defensible claims.

## 2. Reference Model

Sources reviewed:

- CodeCrafters app, docs, challenge authoring guide, program interface, and pricing pages.
- "The Last Human-Written Paper: Agent-Native Research Artifacts" (arXiv:2604.24658).
- Orchestra Research Agent-Native Research Artifact repository and examples.

Key takeaways:

- CodeCrafters wins by using real local workflows, staged progression, tests, immediate
  feedback, and a high-taste "build the thing yourself" identity.
- ARA reframes a paper as a four-layer executable knowledge package: logic, code, trace,
  and evidence.
- ResearchCrafters should combine both: CodeCrafters' learning loop plus ARA's artifact
  structure, with human experts reconstructing the missing research journey.

## 3. Target Users

Primary users:

- AI engineers who can implement models but want stronger research judgment.
- Software engineers moving into applied ML, LLM systems, or research engineering.
- Graduate students and junior researchers who want structured reps on famous papers.

Secondary users:

- Senior engineers who want to deepen their understanding of modern AI papers.
- ML teams using ResearchCrafters as internal training.
- University labs or courses that want executable paper assignments.

## 4. User Problems

Learners often read papers passively and miss the actual research process:

- They understand the final narrative but not the decisions that produced it.
- They do not know which alternative hypotheses failed, why they failed, or when those
  failures are worth revisiting.
- They can copy an implementation but struggle to design experiments and interpret results.
- They cannot reliably separate evidence, interpretation, speculation, and writing.
- They lack a high-signal environment where mistakes become teachable research decisions.

## 5. Product Promise

For each famous paper, ResearchCrafters gives the learner a guided replay of the research:

1. Read the setup and understand the problem pressure.
2. Choose a hypothesis, design, implementation path, or experiment.
3. Implement or reason through the selected step.
4. Run tests, mini-experiments, or structured evaluations.
5. Receive feedback from deterministic validators and an AI mentor.
6. Compare their path against the expert-reconstructed canonical path and dead ends.
7. Write a claim or insight grounded in the evidence they produced.

## 6. Core Unit: Executable Research Package

Each ERP contains:

- A paper narrative: the canonical story of the result.
- A decision graph: important technical choices, including failed and suboptimal paths.
- An executable sandbox: local or remote tasks for implementation and experiment stages.
- Evidence artifacts: logs, tables, metrics, figures, and reproduced mini-results.
- Rubrics: deterministic tests plus expert scoring criteria for open-ended work.
- Mentor context: hints, misconceptions, decision feedback, and branch explanations.

The ERP is the product moat. It should be human-expert crafted, optionally agent-assisted,
and validated before release.

## 7. MVP Scope

The MVP should prove that learners will pay for one excellent ERP.

Included:

- Catalog with 1-2 polished packages.
- Package overview page with paper, skills trained, expected time, and prerequisites.
- Stage-based learning session with decision nodes, code tasks, experiments, writing tasks,
  and feedback.
- Local starter repo plus CLI-driven test submission, or a minimal remote runner if CLI is
  too slow to validate.
- AI mentor that gives hints and reasoning feedback without solving the task outright.
- Progress tracking and a shareable result summary.
- Internal authoring workflow for content creators.

Excluded from MVP:

- Marketplace.
- Browser IDE.
- Fully automated paper-to-ERP generation.
- Heavy GPU training workloads.
- General research project management.
- Public leaderboard unless the first cohort strongly wants it.

## 8. MVP Content Candidates

Best first packages should be famous, technically deep, and reducible to a lightweight
sandbox:

1. FlashAttention: IO-aware attention, memory hierarchy, benchmark interpretation, and
   kernel-level tradeoffs.
2. Attention Is All You Need: sequence modeling decisions, ablation reasoning, and
   architecture design.
3. DPO or RLHF: objective derivation, preference data, evaluation pitfalls, and failed
   reward-model assumptions.
4. ResNet: degradation problem, residual branches, evidence interpretation, and ablation
   logic.

Recommended MVP wedge: FlashAttention or ResNet. FlashAttention has stronger AI-engineer
appeal; ResNet is easier to reproduce cheaply.

## 9. Learning Stage Types

Each ERP should mix several stage types:

- Framing: identify the problem and constraints.
- Math: derive or inspect the core formulation.
- Decision: choose between plausible research branches.
- Implementation: fill in an algorithm, kernel, data pipeline, or evaluation function.
- Experiment: run a miniature experiment or benchmark.
- Analysis: interpret logs, tables, curves, or negative results.
- Writing: produce a precise claim, limitation, or abstract paragraph.
- Review: critique an experimental design or evidence mismatch.
- Reflection: compare learner decisions with expert reconstruction.

## 10. Feedback Model

Feedback should come from three sources:

- Deterministic validators: tests, metric checks, schema checks, code execution.
- Expert-authored branch feedback: why a decision was good, bad, incomplete, or risky.
- AI mentor: contextual explanation, hints, Socratic questions, and personalized feedback.

The AI mentor must not be the source of truth for correctness. It should explain and guide;
validators and expert-authored rubrics decide pass/fail where possible.

## 11. Success Metrics

MVP validation metrics:

- Activation: percent of users who start the first package after landing.
- Stage completion: percent who complete stages 1, 3, 5, and the full package.
- Time in serious effort: median active minutes per package.
- Decision pain: percent of learners who choose a non-canonical branch and read feedback.
- Share rate: percent who share scorecards or "I thought I understood this paper" results.
- Willingness to pay: conversion after 1 free package or after the first hard branch.

Quality metrics:

- Users report a concrete misconception corrected.
- Users can explain why a failed branch failed.
- Users can write a claim grounded in evidence.
- Experts agree that the ERP does not oversimplify the paper.

## 12. Risks and Mitigations

Content is hard to build.

- Start with one excellent package, not a broad catalog.
- Build an internal authoring system early enough to reduce expert friction.
- Keep each package scoped to the research decisions worth training.

Correctness is hard to validate.

- Separate explicit source evidence from inferred reconstruction.
- Require expert review before publishing.
- Keep deterministic validation as the pass/fail backbone.

The format may be unfamiliar.

- Use one short onboarding package that teaches the learning loop.
- Make the first 2-3 stages easy and confidence-building.
- Keep the interface task-focused, not document-heavy.

GPU experiments can become expensive.

- Use miniature sandboxes, cached outputs, CPU-friendly reproductions, and selected
  precomputed evidence.
- Reserve live GPU runs for premium or team workflows later.

Learners may use AI to bypass the reps.

- Design stages around explanation, evidence judgment, and branch reasoning, not only code.
- Allow AI use but score the learner's decisions, claims, and debugging process.

## 13. Positioning

ResearchCrafters is:

- CodeCrafters for AI research engineering.
- A gym for research taste.
- A way to learn papers by replaying the decisions behind them.

ResearchCrafters is not:

- A Kaggle clone.
- A paper summarizer.
- A tutorial site.
- A generic coding challenge platform.
- A full research operating system.

## 14. Phase Plan

Phase 0: Concept validation

- Write one high-quality ERP spec.
- Prototype the session UI in static form.
- Interview 10-20 target learners with the package outline.

Phase 1: MVP

- Build package catalog, session player, progress tracking, local runner, and basic mentor.
- Release one flagship package and one short onboarding package.
- Charge for full access after the free intro.

Phase 2: Authoring system

- Add package schema validation, preview, rubrics, branch graph editor, evidence manager,
  and expert review workflow.

Phase 3: Scale content

- Use agent-assisted drafting to convert papers and repos into ERP candidates.
- Keep human expert review as the quality gate.
- Add team training and university course support.
