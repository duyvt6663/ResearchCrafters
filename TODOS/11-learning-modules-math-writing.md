# Interactive Math and Academic Writing Modules TODO

Status (2026-05-08): see `PROGRESS.md` for the snapshot. Iteration 2
landed the basic `S001M` math node and `S006` writing stage as free-text
rubric prompts; both still need the richer interactive modules described
below before launch.

Goal: make ResearchCrafters train mathematical reasoning and academic writing as
active research-engineering skills, not as passive quiz or essay prompts.

These modules should stay paper-specific and evidence-grounded. A math module
should clarify why an implementation or experiment decision follows from the
paper. A writing module should force the learner to turn evidence into careful
research claims.

Depends on: 01 (stage player), 02 (ERP content), 04 (evaluator), 05 (mentor
safety), 09 (frontend design).

## Design Principles

- [ ] Every module must reference paper equations, claims, implementation
      artifacts, or experiment evidence through `artifact_refs` and
      `evidence_refs`.
- [ ] Avoid generic homework. The learner should use the math or writing result
      in a later decision, implementation, experiment, analysis, or share-card
      step.
- [ ] Prefer constrained transformations over open-ended prompts: fill a
      derivation step, repair a claim, choose the valid assumption, write a
      reviewer response under evidence constraints.
- [ ] Keep canonical answers gated by `stage_policy`; mentors and graders may
      critique reasoning but must not reveal hidden solution text.
- [ ] Support partial credit, revision, and comparison to expert reasoning after
      the learner has attempted the module.

## Interactive Math Modules

Math modules should train the learner to read equations as engineering
constraints. The UI should feel like a compact research notebook, not a generic
multiple-choice quiz.

### Stage Subtypes

- [ ] `derivation_scaffold`: learner fills missing assumptions or algebraic
      steps in a paper derivation.
- [ ] `shape_check`: learner tracks tensor dimensions, broadcasting rules,
      parameter counts, or memory layout through an algorithm.
- [ ] `objective_debug`: learner identifies why a loss/objective term changes
      the optimization behavior.
- [ ] `complexity_budget`: learner computes asymptotic and concrete memory/time
      costs, then chooses the engineering tradeoff.
- [ ] `toy_numeric`: learner evaluates a tiny numerical example that mirrors
      the real experiment.
- [ ] `counterexample`: learner finds the assumption under which a stated claim
      fails.
- [ ] `proof_critique`: learner marks a derivation step as valid, invalid, or
      under-specified and explains the missing condition.

### Data Model and Schemas

- [ ] Add optional `stage_subtype` to math stages.
- [ ] Add structured math input modes: `symbolic_steps`, `numeric_answer`,
      `shape_table`, `proof_outline`, `counterexample`, and `mixed_math`.
- [ ] Define a math answer schema with step ids, learner expressions, selected
      assumptions, numeric values, units/shapes, and free-text explanation.
- [ ] Allow authored per-step hints and per-step feedback, not only whole-stage
      hints.
- [ ] Add `allowed_symbols`, `shape_variables`, `numeric_tolerances`, and
      `accepted_equivalent_forms` fields where deterministic grading is
      possible.

### Frontend

- [ ] Build `MathWorkspace` for mixed symbolic, numeric, and explanation
      inputs.
- [ ] Build `DerivationStepList` with stable step ids, locked givens, editable
      blanks, and per-step feedback.
- [ ] Build `ShapeTableEditor` for tensor dimension and memory-layout stages.
- [ ] Build `ToyExamplePanel` for tiny numeric examples with immediate sanity
      checks.
- [ ] Add math-aware hint behavior: reveal a local hint for the current step
      before revealing broader conceptual hints.
- [ ] Render equations consistently. Start with Markdown/KaTeX rendering; defer
      full symbolic editing until usage proves it is needed.

### Evaluator

- [ ] Deterministically check numeric answers with tolerance and units.
- [ ] Deterministically check tensor shapes and parameter/memory counts.
- [ ] Check symbolic answers against accepted equivalent forms where authored;
      evaluate whether a lightweight symbolic checker is worth adding.
- [ ] Use rubric or constrained LLM grading only for proof outlines,
      counterexamples, and natural-language explanations.
- [ ] Return per-step partial credit so the UI can show exactly where reasoning
      failed.
- [ ] Add math leak tests that try to extract canonical derivations through
      grader explanations.

### Initial ResNet Work

- [x] Add a basic `math` node to the ResNet curriculum graph (`S001M`).
- [ ] Upgrade `S001M` from a rubric-graded free-text prompt into an interactive
      derivation module:
      `H(x)=F(x)+x`, identity target `F(x)=0`, and gradient term
      `dH/dx=dF/dx+1`.
- [ ] Add a wrong-derivation branch where the learner claims residual learning
      "solves vanishing gradients"; require them to repair the mechanism claim.
- [ ] Connect the math result to the later implementation stage so learners see
      why the shortcut path must preserve shape.

### Future Package Examples

- [ ] FlashAttention: derive memory cost of naive attention versus tiled
      attention, then map the result to block-size and SRAM decisions.
- [ ] DPO/RLHF package: derive the preference objective and identify what
      changes when the reference policy term is removed or scaled.
- [ ] Transformer package: compute attention tensor shapes, KV-cache memory, and
      complexity for long-context variants.

## Academic Writing Modules

Writing modules should be active editorial drills. They should train claim
discipline, evidence use, caveats, contribution framing, and reviewer response.
They should not become generic "write an essay about the paper" stages.

### Stage Subtypes

- [ ] `claim_surgery`: rewrite an over-broad or wrong claim into a defensible
      research claim.
- [ ] `evidence_ladder`: map a figure/table/log to claim, warrant, limitation,
      and caveat.
- [ ] `abstract_compression`: write a short abstract under strict word and
      contribution constraints.
- [ ] `reviewer_rebuttal`: answer a skeptical reviewer using only allowed
      evidence and clear uncertainty.
- [ ] `related_work_positioning`: compare the paper to verified prior work
      without hallucinated citations.
- [ ] `method_from_code`: turn implementation details into reproducible methods
      prose.
- [ ] `figure_caption_results`: write a figure caption and results paragraph
      from artifact data.
- [ ] `limitations_threat_model`: state what the experiment does not prove and
      what would be needed to strengthen the claim.

### Data Model and Schemas

- [ ] Add optional `stage_subtype` to writing stages.
- [ ] Add `writing_constraints`: word budget, required evidence refs, forbidden
      claims, allowed citation set, required caveat, and target venue style.
- [ ] Add `citation_policy`: verified-only citation ids, placeholder policy,
      and whether external citation search is disabled for the stage.
- [ ] Add `reviewer_prompt` for rebuttal stages, including persona, criticism,
      and evidence allowed for response.
- [ ] Add revision metadata: original draft, edited draft, revision note, and
      final answer.

### Frontend

- [ ] Build `WritingWorkbench` with evidence, draft, rubric, and mentor-review
      panes.
- [ ] Build `ClaimEvidenceMatrix` so each sentence-level claim must map to an
      evidence ref or explicit caveat.
- [ ] Add citation insertion from the evidence panel with visible verification
      status.
- [ ] Add word-budget and rubric-criterion live indicators.
- [ ] Add `RevisionDiff` for before/after claim surgery and rebuttal revisions.
- [ ] Add `ReviewerPanel` for rebuttal stages with the reviewer criticism fixed
      in view.

### Evaluator

- [ ] Grade claim precision, evidence grounding, caveat discipline,
      contribution framing, citation hygiene, reproducibility detail, and
      concision.
- [ ] Reject or flag unsupported claims that cite no allowed evidence ref.
- [ ] Flag forbidden claims such as "always", "solves", or "state of the art"
      when the stage evidence does not support them.
- [ ] Never reward fabricated citations. If a citation is not in the verified
      allowed set, mark it as unverified or require replacement.
- [ ] Use LLM grading only with rubric criteria and allowed evidence; learner
      text remains untrusted and output passes through the redaction layer.
- [ ] Emit evaluator metadata for writing feedback: rubric version, allowed
      evidence refs, citation policy, and redaction status.

### Mentor Behavior

- [ ] Mentor can act as a reviewer or editor by asking for sharper scope,
      missing evidence, and caveats.
- [ ] Mentor must not write the final answer wholesale before an attempt.
- [ ] Mentor may provide sentence-level critique after the learner has drafted.
- [ ] Mentor should suggest which evidence ref to inspect, not invent external
      citations.

### Initial ResNet Work

- [x] Add a basic writing stage to the ResNet curriculum (`S006`).
- [ ] Upgrade `S006` into `claim_surgery` plus `evidence_ladder`: start from an
      overclaim, force the learner to attach evidence refs, and require a final
      scoped claim.
- [ ] Add a reviewer-rebuttal micro-stage after the experiment-review stage:
      respond to "Isn't this just vanishing gradients?" using the allowed
      ResNet evidence.
- [ ] Add rubric fixtures with strong, weak, overclaiming, and citation-missing
      example answers for evaluator regression tests.

### Acceptance Criteria

- [ ] A learner completes at least one interactive math module and one academic
      writing module in the flagship package before launch.
- [ ] The modules produce structured grades with per-dimension feedback.
- [ ] The writing module visibly improves a draft through revision, not just a
      single submission.
- [ ] The math module catches at least one misconception that would lead to a
      wrong implementation or experiment interpretation.
- [ ] Package validation fails if a math or writing module lacks artifact refs,
      allowed evidence, rubric, stage policy, or leak-test coverage.
