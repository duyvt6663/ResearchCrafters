# Agentic ERP Reconstruction Backlog

Goal: build an agentic authoring workflow that converts a paper URL, arXiv id,
or PDF into a complete draft Executable Research Package (ERP), then iterates
against ResearchCrafters validation, safety, and review gates until the package
is ready for human expert review.

Status (2026-05-14): planned. This is an authoring accelerator, not a publishing
shortcut. Generated packages must use the normal `content/packages/<slug>/`
filesystem contract and must pass `researchcrafters validate` before any
promotion beyond `alpha`.

Depends on: 02 (ERP content package), 03 (CLI and runner), 04 (validation and
evaluator), 05 (mentor safety), 11 (math/writing modules). Later integration
depends on Phase 4 authoring surfaces from `docs/TECHNICAL.md`.

## Operating Principles

- [ ] Keep package source as the canonical output. The agent writes normal files
      under `content/packages/<slug>/`, not a parallel package format.
- [ ] Treat `packages/erp-schema` and `packages/content-sdk` as hard contracts.
      Agent output is correct only when the existing schemas and validators
      accept it.
- [ ] Generate the happy path first: paper metadata, ARA artifact, linear
      curriculum, starter workspace, canonical solution, and validation report.
- [ ] Add failed, suboptimal, ambiguous, and extension branches only after the
      happy path validates.
- [ ] Preserve evidence discipline. Every source-supported claim needs a source
      or evidence ref; reconstructed branches must declare `support_level`.
- [ ] Use AI for drafting and critique, not final correctness. Expert review
      remains mandatory for branch fairness, evidence calibration, and rubric
      quality.
- [ ] Make every side effect idempotent: downloads, source snapshots, generated
      files, fixture writes, and validation reports should be resumable by run id.
- [ ] Keep canonical answers gated. Generated stages must include
      `stage_policy`, `mentor_redaction_targets`, and leak tests wherever mentor
      or LLM grading can touch hidden answers.

## Target Workflow

```text
resolve_input
  -> download_paper
  -> parse_paper
  -> gather_learning_materials
  -> extract_ara
  -> reconstruct_branches
  -> plan_curriculum
  -> human_plan_review
  -> generate_happy_path_package
  -> validate_package
  -> repair_loop
  -> expand_modules_and_branches
  -> run_quality_agents
  -> tailor_learning_experience
  -> final_validation
  -> human_release_review
```

## Phase 0 - Product Boundary

- [ ] Define accepted inputs: arXiv id, paper URL, direct PDF URL, local PDF
      path, and optional seed links for official code or project pages.
- [ ] Define output contract: a draft package under `content/packages/<slug>/`,
      an agent run folder under `.researchcrafters/erp-agent/runs/<run_id>/`,
      and a final `agent-report.md`.
- [ ] Define statuses for generated packages: default to `alpha`; never emit
      `beta` or `live` without explicit human release approval.
- [ ] Decide whether the first implementation runs only locally or also as an
      internal worker job.
- [ ] Decide where long-running source caches live: repo-local run directory,
      object storage, or both.
- [ ] Add a policy that generated source excerpts must be summarized or cited
      without copying large copyrighted passages.

## Phase 1 - Agent App Skeleton

- [ ] Add `apps/erp-agent/` as a Python app with its own `pyproject.toml`.
- [ ] Add a CLI entrypoint:
      `erp-agent create --input <url|arxiv|pdf> --slug <slug>`.
- [ ] Add a resumable run command:
      `erp-agent resume --run-id <run_id>`.
- [ ] Add a dry-run planning command:
      `erp-agent plan --input <url|arxiv|pdf>`.
- [ ] Add configuration for model providers, search providers, cache paths,
      max source count, max repair iterations, and validation command path.
- [ ] Add structured logging with run id, graph node name, package slug, and
      current package path.
- [ ] Add a run manifest containing input hash, paper metadata, source snapshots,
      generated file list, validation reports, review findings, and decisions.

## Phase 2 - LangGraph State and Persistence

- [ ] Define `PaperInput`: raw input, normalized URL or arXiv id, local PDF path,
      source hash, and user-supplied seed links.
- [ ] Define `ParsedPaper`: metadata, sections, equations, figures, tables,
      captions, references, and extracted implementation clues.
- [ ] Define `ResearchCorpus`: source cards for paper, official code, talks,
      blogs, issue threads, reproduction repos, and tutorials.
- [ ] Define `ARAPlan`: problem statement, claims, concepts, experiments,
      solution architecture, constraints, heuristics, and evidence ledger.
- [ ] Define `BranchPlan`: canonical, failed, suboptimal, ambiguous, and
      extension branches with support levels and evidence refs.
- [ ] Define `CurriculumPlan`: stage list, graph nodes, branch choices, stage
      types, time budget, prerequisites, skills, and execution feasibility.
- [ ] Define `PackageDraft`: package path, generated files, runner modes,
      fixture inventory, redaction targets, validation reports, and repair count.
- [ ] Define `ReviewFindings`: schema findings, evidence findings, branch
      fairness findings, pedagogy findings, safety findings, and learner
      simulation findings.
- [ ] Use a durable checkpointer before any graph is allowed to call external
      services or write files.
- [ ] Wrap side effects in task boundaries so resume does not redownload,
      duplicate file writes, or re-run expensive searches unnecessarily.

## Phase 3 - Paper Ingestion and Parsing

- [ ] Implement `resolve_input` for arXiv ids, URLs, direct PDFs, and local PDFs.
- [ ] Implement `download_paper` with content hashing and cached raw artifacts.
- [ ] Implement `extract_metadata` for title, authors, year, venue, arXiv id,
      abstract, and citation metadata.
- [ ] Implement `parse_pdf` for section hierarchy, equations, tables, figures,
      captions, references, and appendix detection.
- [ ] Implement `normalize_paper_md` to draft `artifact/PAPER.md`.
- [ ] Add parser confidence scores and fallback notes when PDF extraction is
      incomplete.
- [ ] Add tests with at least one arXiv paper fixture and one local PDF fixture.

## Phase 4 - Source Research Node

- [ ] Gather official sources first: paper page, arXiv, project page, official
      code, author talks, and official docs.
- [ ] Gather supporting learning material: tutorials, lecture notes,
      reproduction reports, issue threads, benchmark repos, and high-quality
      blog posts.
- [ ] Score each source by authority, relevance, recency, reproducibility value,
      and licensing/copyright risk.
- [ ] Deduplicate near-identical sources and preserve canonical URLs.
- [ ] Extract implementation clues: environment, dependencies, datasets,
      metrics, commands, configs, and known pitfalls.
- [ ] Extract teaching clues: common misconceptions, ablation results, failed
      assumptions, and branch-worthy alternatives.
- [ ] Store source cards in the run folder and cite them from the evidence
      ledger.

## Phase 5 - ARA Extraction

- [ ] Generate `artifact/logic/problem.md`.
- [ ] Generate `artifact/logic/claims.md` with stable anchors and source or
      evidence refs for each claim.
- [ ] Generate `artifact/logic/concepts.md` with the vocabulary a learner needs
      before the first decision.
- [ ] Generate `artifact/logic/experiments.md` with experiment design, metrics,
      baselines, ablations, and expected outputs.
- [ ] Generate `artifact/logic/related_work.md` from verified citations and
      source cards.
- [ ] Generate `artifact/logic/solution/architecture.md`.
- [ ] Generate `artifact/logic/solution/algorithm.md`.
- [ ] Generate `artifact/logic/solution/constraints.md`.
- [ ] Generate `artifact/logic/solution/heuristics.md`.
- [ ] Generate `artifact/src/environment.md` and execution notes.
- [ ] Generate `artifact/trace/exploration_tree.yaml`.
- [ ] Generate `artifact/evidence/` tables, fixture notes, cached output notes,
      and provenance stubs.
- [ ] Add an ARA critic that fails unsupported or over-broad claims before
      curriculum generation starts.

## Phase 6 - Branch Reconstruction

- [ ] Identify the canonical research path and the central decision the learner
      should experience.
- [ ] Extract explicit failed or suboptimal branches from paper ablations,
      negative results, appendices, issue threads, and reproduction notes.
- [ ] Infer expert-reconstructed branches only when they are pedagogically useful
      and supported by stated constraints or measurements.
- [ ] Label every branch with `canonical`, `failed`, `suboptimal`, `ambiguous`,
      or `extension`.
- [ ] Label every branch with `explicit`, `inferred`, or
      `expert_reconstructed`.
- [ ] Generate branch YAML under `curriculum/branches/`.
- [ ] Generate branch solution notes under `solutions/branches/`.
- [ ] Add a branch fairness critic that checks whether non-canonical choices are
      plausible from the learner's point in the journey.
- [ ] Add a branch evidence critic that ensures explicit branches include
      non-empty `source_refs`.

## Phase 7 - Planning Mode

- [ ] Generate a package plan before writing the full ERP.
- [ ] Include package metadata: slug, title, difficulty, estimated time, skills,
      prerequisites, free stages, and GPU requirements.
- [ ] Include proposed curriculum graph with 8-12 stages and required stage
      types: framing, math, decision, implementation, experiment, analysis,
      writing, review, reflection.
- [ ] Include execution plan for each executable stage: `test`, `replay`,
      `mini_experiment`, or `none`.
- [ ] Include fixture acquisition plan with hardware, commands, provenance, and
      hash expectations.
- [ ] Include safety plan: redaction targets, hidden answer risks, and mentor
      leak-test prompts.
- [ ] Interrupt for human approval before writing the full package draft.
- [ ] Save the approved plan to the run folder and copy a summary into the
      generated package README.

## Phase 8 - Happy Path Package Generation

- [ ] Copy `content/templates/erp-basic` to `content/packages/<slug>/`.
- [ ] Replace template metadata in `package.yaml` and `README.md`.
- [ ] Write the core ARA files under `artifact/`.
- [ ] Generate a minimal curriculum graph that reaches the canonical lesson
      without optional branches.
- [ ] Generate initial stages for framing, core decision, implementation or
      analysis, writing, and reflection.
- [ ] Generate progressive hints for every initial stage.
- [ ] Generate rubrics for every rubric-graded stage.
- [ ] Generate starter files under `workspace/starter/`.
- [ ] Generate tests under `workspace/tests/` for at least one implementation
      or deterministic analysis stage.
- [ ] Generate canonical solution files under `solutions/canonical/`.
- [ ] Generate `workspace/runner.yaml` with declared modes, resources, fixture
      hashes, and no network access by default.
- [ ] Run `researchcrafters validate <package-path> --json`.

## Phase 9 - Validation and Repair Loop

- [ ] Parse validation reports into structural, ARA, sandbox, and pedagogy
      buckets.
- [ ] Add `schema_repair` for malformed YAML, missing fields, invalid enums, and
      stage-policy shape issues.
- [ ] Add `ara_link_repair` for missing refs, dangling anchors, missing evidence,
      and branch/source inconsistencies.
- [ ] Add `sandbox_repair` for fixture hash mismatches, missing runner stages,
      unsafe network settings, and command/resource issues.
- [ ] Add `pedagogy_repair` for missing hints, unclear prompts, absent leak
      tests, weak feedback, and first-two-stage pacing.
- [ ] Add `safety_repair` for redaction targets, mentor leak tests, and hidden
      canonical snippets.
- [ ] Re-run validation after each repair pass.
- [ ] Stop after a configurable repair budget and emit precise blockers instead
      of looping indefinitely.

## Phase 10 - Full ERP Expansion

- [ ] Expand from the happy path to a complete 8-12 stage package.
- [ ] Add failed, suboptimal, ambiguous, or extension branches to the decision
      graph.
- [ ] Add at least one implementation stage when the paper has feasible code.
- [ ] Add at least one experiment, replay, or evidence-interpretation stage.
- [ ] Add at least one math stage connected to an implementation or experiment
      decision.
- [ ] Add at least one writing stage that turns evidence into a defensible
      research claim.
- [ ] Add review and reflection stages that compare learner choices to the
      reconstructed research path.
- [ ] Add common misconceptions for each stage.
- [ ] Add expert branch feedback for every branch.
- [ ] Add package-level and stage-level redaction targets.

## Phase 11 - Tailored Learning Experience

- [ ] Run learner simulations for beginner, intermediate, and expert personas.
- [ ] Identify stages where prerequisites are missing or task copy assumes too
      much.
- [ ] Add optional scaffolding for weaker learners without exposing canonical
      answers.
- [ ] Add challenge extensions for advanced learners.
- [ ] Adjust time estimates and difficulty labels from simulated completion
      traces.
- [ ] Add misconception-specific hints and feedback.
- [ ] Ensure the first two stages remain quick enough for preview onboarding.
- [ ] Produce a reviewer-facing summary of learner simulation failures and
      mitigations.

## Phase 12 - Quality Agents

- [ ] Add `SchemaCritic`: checks compatibility with `packages/erp-schema`.
- [ ] Add `EvidenceCritic`: checks that claims do not exceed cited evidence.
- [ ] Add `BranchCritic`: checks branch plausibility, support level, and fairness.
- [ ] Add `PedagogyCritic`: checks that stages require practice rather than
      passive summary.
- [ ] Add `RunnerCritic`: checks starter/canonical/test/fixture coherence.
- [ ] Add `SafetyCritic`: checks stage policies, redaction targets, and leak-test
      coverage.
- [ ] Add `WritingCritic`: checks claim precision, citation hygiene, caveats,
      and rubric coverage.
- [ ] Add `MathCritic`: checks whether math tasks have deterministic or
      rubric-backed grading paths.
- [ ] Record each critic finding in the run manifest with severity, file, and
      proposed repair.

## Phase 13 - Finalization and Handoff

- [ ] Run `researchcrafters validate <package-path> --json` and save the report.
- [ ] Run `researchcrafters build <package-path>` and save the manifest.
- [ ] Run package-specific tests for generated executable stages.
- [ ] Generate `agent-report.md` with source coverage, generated file list,
      validation summary, unresolved risks, and reviewer checklist.
- [ ] Mark unresolved fixture runs, placeholder evidence, or expert assumptions
      as release blockers.
- [ ] Require human expert approval before changing status from `alpha` to
      `beta` or `live`.
- [ ] Require a final package diff review before committing generated output.

## Integration Notes

- [ ] Use `content/templates/erp-basic` as the initial scaffold.
- [ ] Use `content/packages/resnet` as the reference quality bar.
- [ ] Call the existing CLI for validation and build rather than reimplementing
      TypeScript validators in Python.
- [ ] Keep generated code and fixtures small enough for local author review
      unless a later worker-backed flow is explicitly designed.
- [ ] Do not add production UI changes for the agent without first sandboxing
      non-trivial UX in `apps/web/experiments/`.
- [ ] Add CI only after the local workflow produces one successful generated
      draft package.

## Acceptance Criteria

- [ ] Given an arXiv id, URL, or local PDF, the agent creates a draft package
      folder with package metadata, ARA artifact files, curriculum, workspace,
      solutions, and safety policy.
- [ ] The happy-path package validates or produces a finite blocker report with
      actionable file-level findings.
- [ ] The expanded package contains meaningful failed or suboptimal branches, not
      just a linear summary.
- [ ] Generated stages include implementation, experiment or evidence analysis,
      math, writing, review, and reflection when feasible for the paper.
- [ ] Generated packages never bypass expert review or publish themselves as
      `beta` or `live`.
- [ ] The run can resume after interruption without duplicating downloads,
      source snapshots, or generated file writes.
