# Figures (placeholder)

Figures are generated from the cached fixture at
`workspace/fixtures/stage-004/training_log.json` and live alongside the
package under `media/diagrams/` once authored.

Planned figures:

- `degradation-curve.png` — training error vs epoch for plain-20 and
  plain-56 on CIFAR-10. Used in stage `S001` framing.
- `residual-vs-plain.png` — training and test error vs epoch for plain-56
  and residual-56. Used in stage `S005` analysis.
- `block-diagram.png` — basic vs bottleneck block topology with shortcut
  paths labeled. Used as supporting media in `S003` and `S008`.

Each figure file should record the fixture SHA and the script used to
render it in adjacent metadata, so a reviewer can verify provenance.
