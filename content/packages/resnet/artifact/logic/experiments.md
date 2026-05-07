# Experiments

The package replays a miniature subset of the original ResNet experimental
program. Heavy ImageNet runs are not in scope; CIFAR-10 plain-vs-residual
serves as the main evidence target.

## E01 — CIFAR-10 plain vs residual

- **Setup.** A 20-layer and a 56-layer CNN trained on CIFAR-10 with SGD,
  batch normalization, weight decay, and standard augmentation (pad-and-crop,
  horizontal flip).
- **Plain variant.** Stacked Conv-BN-ReLU blocks, no shortcut.
- **Residual variant.** Same depth, with identity shortcut on every two
  conv layers (basic block).
- **Outputs.** Per-epoch training loss, training error, test error.
- **Replay fixture.** `workspace/fixtures/stage-004/training_log.json`
  represents the cached output. Used by stage `S004`.
- **Claim mapping.**
  - `claims.md#degradation`
  - `claims.md#residual-helps`

## E02 — Basic vs bottleneck (descriptive)

- **Setup.** Compare ResNet-34 (basic) and ResNet-50 (bottleneck) parameter
  count, FLOPs, and validation top-1 error. The package treats this
  experiment as descriptive, not learner-runnable.
- **Outputs.** Reference table only.
- **Claim mapping.**
  - `claims.md#bottleneck-tradeoff`

## E03 — Bottleneck without shortcut (expert-reconstructed)

- **Setup.** Hypothetical control: bottleneck topology with the addition
  removed. Used as the failed/suboptimal branch teaching tool.
- **Outputs.** Author-supplied reasoning, not new measurements.
- **Claim mapping.**
  - `claims.md#branch-bottleneck-without-shortcut`
  - `claims.md#identity-is-the-trick`
