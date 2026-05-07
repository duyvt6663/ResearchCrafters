# ResNet ARA Manifest

This artifact is the Agent-Native Research Artifact (ARA) layer for the ResNet
ERP. It is intentionally separated from the curriculum so that the same logic,
trace, source, and evidence layers can be consumed by AI agents, not just
learners.

## Layer Index

- `logic/` — problem statement, claims, concepts, experiments, solution
  decomposition, related work.
  - `logic/problem.md` — degradation phenomenon and why deeper plain networks
    train worse.
  - `logic/claims.md` — central claims with anchors used as `source_refs`
    throughout the package.
  - `logic/concepts.md` — vocabulary the learner must internalize before
    attempting the decision stage.
  - `logic/experiments.md` — experimental plan: CIFAR-10 plain vs residual,
    ImageNet 18/34/50/101/152, ablations.
  - `logic/solution/architecture.md` — building blocks and stage diagrams.
  - `logic/solution/algorithm.md` — forward/backward through a residual block.
  - `logic/solution/constraints.md` — invariants the solution must respect.
  - `logic/solution/heuristics.md` — practical guidance from the paper and
    follow-up work.
  - `logic/related_work.md` — Highway Networks, batch normalization, and the
    pre-ResNet baseline.
- `src/` — placeholder configs and execution recipes that mirror the canonical
  reference implementation (no model weights or working trainer here; see
  `workspace/` for the learner-facing scaffold and `solutions/canonical/` for
  the reference solution).
  - `src/configs/README.md`
  - `src/execution/README.md`
  - `src/environment.md`
- `trace/` — the exploration tree that records which branches existed, which
  the canonical paper took, and which were rejected.
  - `trace/exploration_tree.yaml`
- `evidence/` — tables, figures, and logs used as `evidence_refs` for the
  curriculum's claims and rubrics.
  - `evidence/README.md`
  - `evidence/tables/training-curves.md`
  - `evidence/figures/README.md`
  - `evidence/logs/README.md`

## Cross-link discipline

- Anchors in `logic/claims.md` (e.g. `#degradation`, `#residual-helps`,
  `#bottleneck-tradeoff`) are referenced from stage `source_refs`,
  `evidence_refs`, and branch metadata. Renaming an anchor requires updating
  every reference.
- Every claim with `support_level: explicit` cites a source section in the
  ResNet paper, recorded inside `logic/claims.md`.
- Branches in the trace tree must point back to a logic claim and either an
  evidence artifact or an explicit `expert_reconstructed` note.
