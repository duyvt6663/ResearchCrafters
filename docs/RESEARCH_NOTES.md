# Research Notes

Last updated: 2026-05-07

## Sources Reviewed

CodeCrafters:

- https://app.codecrafters.io/
- https://codecrafters.io/
- https://codecrafters.io/philosophy
- https://codecrafters.io/pricing
- https://docs.codecrafters.io/challenges/how-challenges-work
- https://docs.codecrafters.io/challenges/program-interface
- https://docs.codecrafters.io/cli/usage
- https://docs.codecrafters.io/contributors/authoring-challenges/planning-your-challenge
- https://docs.codecrafters.io/contributors/authoring-challenges/course-definition-reference

ARA:

- https://arxiv.org/abs/2604.24658
- https://www.orchestra-research.com/ara
- https://github.com/Orchestra-Research/Agent-Native-Research-Artifact

## CodeCrafters Findings

CodeCrafters' core loop is simple:

1. Pick a real system challenge.
2. Work locally in the learner's own editor.
3. Push or submit code.
4. Run staged tests.
5. Receive fast feedback and unlock the next stage.

Important mechanics to adapt:

- The unit of progress is a stage.
- The learner works in a real local workflow, not a toy browser editor.
- Stages are intentionally small early on, then become harder.
- Tests and feedback create the learning loop.
- Challenge metadata is structured: slug, name, release status, language starter repos,
  stage descriptions, difficulty, marketing copy, and tester links.
- Membership value comes from full access, faster feedback, code examples, and team
  features.

Implications for ResearchCrafters:

- Keep the first product loop stage-based and test-driven.
- Do not start with a browser IDE.
- Use local CLI plus remote runner as the first execution model.
- Treat stages as authored, versioned content with explicit schema.
- Build the authoring system around stage quality and tester reliability.

## ARA Paper Findings

The paper argues that traditional publication compresses a branching research process into
a linear narrative. It names two costs:

- Storytelling Tax: failed experiments, rejected hypotheses, and branching exploration are
  discarded.
- Engineering Tax: prose sufficient for reviewers is underspecified for agents that need
  to reproduce or extend work.

ARA proposes four artifact layers:

- Scientific logic.
- Executable code with full specifications.
- Exploration graph preserving failures and decisions.
- Evidence grounding claims in raw outputs.

The paper also introduces ecosystem mechanisms:

- Live Research Manager.
- ARA Compiler.
- ARA-native review.

Implications for ResearchCrafters:

- ERP should preserve the four-layer ARA structure but add a learner-facing curriculum.
- Failed branches should become first-class learning assets.
- Expert review should focus on claim/evidence calibration and branch legitimacy.
- The product should separate raw evidence from interpretation.

## ARA Repository Findings

The repository implements the protocol as files and skills. The examples show an
ARA-compatible package with:

- `PAPER.md` root manifest.
- `logic/` for problem, claims, concepts, experiment plans, solution, and related work.
- `src/` for configs, environment, and execution stubs.
- `trace/exploration_tree.yaml` for the research DAG.
- `evidence/` for tables, figures, logs, and result indices.

The repo includes three relevant agent skills:

- `compiler`: converts papers, repos, notes, and logs into ARA artifacts.
- `research-manager`: captures research events, decisions, experiments, and dead ends.
- `rigor-reviewer`: performs semantic review over evidence, falsifiability, and scope.

Implications for ResearchCrafters:

- Keep ARA compatibility in `artifact/`.
- Add ResearchCrafters-specific `curriculum/`, `workspace/`, `solutions/`, and `media/`.
- Use agent-assisted compilation for drafts only; publish only after expert review.
- Build validation around structural checks, cross-layer bindings, sandbox checks, and
  pedagogy checks.

## Product Synthesis

ResearchCrafters should be:

- CodeCrafters' staged, local, test-driven learning loop.
- ARA's structured research artifact.
- Human expert reconstruction of the missing research branch graph.

The first real product should prove one claim:

Learners will pay for an expertly reconstructed, executable version of a famous AI paper
because it exposes gaps that passive paper reading and code copying do not.
