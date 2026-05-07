# Heuristics

Practical guidance the canonical paper and follow-up work suggest. These are
not theorems; they are taste.

## Initialization

- Use He initialization (`kaiming_normal_`) for convolutional weights. The
  authors emphasize this in earlier work; without it very deep ResNets are
  noticeably harder to train.
- Initialize the last BatchNorm of each residual block with `gamma = 0` if
  you want the network to *start* exactly at identity. This is a follow-up
  trick (Goyal et al., 2017) that can help at very large batch sizes.

## Optimization

- SGD with momentum 0.9 is the default in the paper.
- Step-decay learning rate (e.g. drop by 10x at 50% and 75% of training) is
  the canonical schedule for CIFAR-10 ResNet.
- Weight decay around `1e-4` is typical.

## Block placement

- Use bottleneck blocks for ResNet-50 and deeper. The basic block is fine
  for CIFAR-10 ResNet-20/56.
- The first block in each stage downsamples (stride 2) and doubles channels.
  All other blocks in the stage are stride 1.

## Debugging hints

- If training loss stays flat and very high, check that the addition is
  shape-aligned and that the projection shortcut has the right stride.
- If training loss diverges to NaN early, check He initialization and that
  BatchNorm is active in train mode.
- If the residual model is no better than plain at depth 20, this is
  expected: degradation only kicks in at much higher depths. Use depth ≥ 56
  for the failure mode to be visible.
