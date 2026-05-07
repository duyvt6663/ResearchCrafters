# Related Work

The residual formulation did not appear in a vacuum. Three nearby ideas form
the relevant decision context for ResNet.

## Highway Networks (Srivastava, Greff, Schmidhuber, 2015)

Highway Networks introduced *gated* shortcut connections of the form

```
y = T(x) * H(x) + (1 - T(x)) * x
```

where `T` is a learned gating function. Highway Networks showed that shortcut
connections enable training of very deep networks. ResNet's contribution
relative to Highway Networks is the *parameter-free* identity shortcut, which
is simpler, has no gating to fail, and consistently improves with depth.

## Batch Normalization (Ioffe and Szegedy, 2015)

BatchNorm partly addresses the vanishing/exploding gradient story by keeping
forward and backward signals at non-trivial variance. ResNet uses BN. The key
ResNet observation is that *even with BN*, plain deep stacks degrade. So the
remaining problem is optimization-difficulty at depth, not signal scale.

## VGG (Simonyan and Zisserman, 2014)

VGG established that depth helps, with a simple, uniform 3x3-stack design.
ResNet inherits VGG's "stages with constant channel width followed by stride-2
transitions" topology and replaces each block with a residual block.

## Why these matter for the decision stage

When a learner reaches stage `S002` and asks "which fix do you attack first?",
the three branches in the package map onto the three branches a 2015-era
researcher could plausibly have considered:

- `branch-residual-canonical` — identity shortcut, the ResNet path.
- `branch-deeper-no-residual` — keep stacking with better optimizer or more
  BN, the failed path.
- `branch-bottleneck-suboptimal` — change the block topology without adding
  a shortcut, the suboptimal path.
