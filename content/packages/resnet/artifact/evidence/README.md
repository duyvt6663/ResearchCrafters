# Evidence

Index of evidence artifacts used as `evidence_refs` from claims, branches,
and rubric criteria.

## Tables

- `tables/training-curves.md` — CIFAR-10 plain-vs-residual training and test
  error per epoch (placeholder summary; underlying numbers come from
  `workspace/fixtures/stage-004/training_log.json`).

## Figures

- `figures/README.md` — figure index. Actual figure PNGs ship under
  `media/diagrams/` and `media/share-card/` once authored.

## Logs

- `logs/README.md` — log index for fixture acquisition runs. Raw logs are
  not redistributed inside the package; they live in fixture storage and
  are referenced by SHA in `workspace/runner.yaml`.

## Cross-link discipline

Each evidence artifact should declare the claim anchors it supports and
the experiment id (`E01`, `E02`, `E03`) it belongs to.
