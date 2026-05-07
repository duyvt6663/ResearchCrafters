# erp-basic template

Skeleton for a new Executable Research Package. Copy this directory into
`content/packages/<your-slug>/`, replace every `TODO` and every file
with content for your paper, and run `researchcrafters validate`.

## How to use

```
cp -r content/templates/erp-basic content/packages/<your-slug>
cd content/packages/<your-slug>
# Replace TODO markers in package.yaml, README.md, and curriculum/.
# Author the artifact/ layer using the ARA pattern.
# Author at least 8 stages — see content/packages/resnet/ for the flagship.
```

## Layout

The template ships a *one-stage, one-branch* skeleton. The flagship
ResNet package (`content/packages/resnet/`) is the reference for what
a complete package looks like with eight stages, three branches, full
artifact layer, fixtures, and tests.

```text
erp-basic/
  package.yaml           # paper metadata, status, free stages, redaction
  README.md              # this file
  artifact/
    PAPER.md
    logic/
      problem.md
      claims.md
      concepts.md
      experiments.md
      related_work.md
      solution/
        architecture.md
        algorithm.md
        constraints.md
        heuristics.md
    src/
      configs/README.md
      execution/README.md
      environment.md
    trace/exploration_tree.yaml
    evidence/README.md
  curriculum/
    graph.yaml
    stages/001-problem-framing.yaml
    rubrics/problem-framing.yaml
    hints/stage-001.yaml
    branches/branch-canonical.yaml
  workspace/
    starter/sample.py
    tests/test_sample.py
    fixtures/README.md
    runner.yaml
    docker/Dockerfile
  solutions/
    canonical/sample.py
    branches/README.md
  media/
    diagrams/.gitkeep
    share-card/.gitkeep
```

## Required edits

- Replace every `TODO_*` marker in YAML.
- Add at least one `failed` and one `suboptimal` branch under
  `curriculum/branches/`.
- Add at least 8 stages spanning framing, decision, implementation,
  experiment, analysis, writing, review, reflection.
- Provide non-empty `source_refs` for every claim and branch with
  `support_level: explicit`.
- Compute fixture SHA-256 hashes with `shasum -a 256` and record them
  in `workspace/runner.yaml`.
- Add at least three mentor leak tests per stage.
