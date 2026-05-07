# Training Curves (placeholder)

Source experiment: `E01` — CIFAR-10 plain vs residual at depths 20 and 56.
Underlying numbers live in
`workspace/fixtures/stage-004/training_log.json`. The numbers below are a
human-readable summary; the canonical fixture is the JSON file.

## #plain-vs-residual

CIFAR-10 final training and test error after 164 epochs (illustrative
placeholder values, not authoritative).

| Variant       | Depth | Train error | Test error |
|---------------|-------|-------------|------------|
| plain         |    20 | ~0.06       | ~0.092     |
| plain         |    56 | ~0.08       | ~0.115     |
| residual      |    20 | ~0.05       | ~0.085     |
| residual      |    56 | ~0.03       | ~0.069     |

The interpretive point is the *direction* of change at depth 56:

- Plain: error rises with depth.
- Residual: error falls with depth.

Supports: `artifact/logic/claims.md#degradation`,
`artifact/logic/claims.md#residual-helps`.

## #bottleneck-vs-basic

Reference values (from the original ResNet paper, ImageNet top-1):

| Variant   | Depth | Top-1 error | Params |
|-----------|-------|-------------|--------|
| basic     |    34 | ~0.265      | 21.8 M |
| bottleneck|    50 | ~0.232      | 25.6 M |
| bottleneck|   101 | ~0.224      | 44.5 M |

Supports: `artifact/logic/claims.md#bottleneck-tradeoff`. Numbers are
approximate and exist for descriptive comparison only; this package does
not verify them.
