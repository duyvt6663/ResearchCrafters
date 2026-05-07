# Configs (placeholder)

Reference YAML configs for the canonical CIFAR-10 ResNet-20 training run. The
ERP does not currently ship these as runnable; they are placeholders for the
schema-agent to lift into typed config schemas later.

## Files (planned)

- `cifar10_resnet20.yaml` — model depth, width, optimizer, schedule.
- `cifar10_plain20.yaml` — same, no shortcut connections.
- `cifar10_resnet56.yaml` — depth-56 residual variant for visualizing
  degradation when shortcuts are removed.

## Skeleton

```yaml
# cifar10_resnet20.yaml (illustrative, not yet runnable)
model:
  family: resnet
  depth: 20
  width: 16
  block: basic
  shortcut: identity
data:
  dataset: cifar10
  augmentation:
    pad_and_crop: 4
    horizontal_flip: true
  batch_size: 128
optim:
  name: sgd
  lr: 0.1
  momentum: 0.9
  weight_decay: 0.0001
  schedule:
    kind: step
    milestones: [82, 123]
    gamma: 0.1
training:
  epochs: 164
  log_every_n_steps: 100
```
