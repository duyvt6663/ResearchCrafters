# branch-bottleneck-suboptimal (suboptimal)

## Narrative

The bottleneck branch swaps the basic block for a 1x1 → 3x3 → 1x1
topology. This *is* a real and important innovation: it is what makes
ResNet-50, ResNet-101, and ResNet-152 practical at the original
ImageNet compute budget by reducing parameters and FLOPs per unit of
depth.

The branch is labeled *suboptimal*, not *failed*, because it does
useful work — but it does not work on the axis the learner is trying
to fix. Bottleneck without an identity shortcut still suffers
degradation: the optimizer's identity-recovery problem is unchanged by
a topology swap.

The package marks this branch's `support_level` as `inferred` because
the original ResNet paper does not run a controlled
"bottleneck-without-shortcut" ablation; the conclusion is implied by
the paper's framing rather than measured directly.

## Sketch

A bottleneck block without a shortcut has the same parameter savings
as the canonical bottleneck but loses the identity-recovery property.
We include this sketch only as a teaching contrast.

```python
class BottleneckNoShortcut(nn.Module):
    def __init__(self, in_c, mid_c, out_c, stride):
        super().__init__()
        self.conv1 = nn.Conv2d(in_c, mid_c, 1, 1, 0, bias=False)
        self.bn1 = nn.BatchNorm2d(mid_c)
        self.conv2 = nn.Conv2d(mid_c, mid_c, 3, stride, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(mid_c)
        self.conv3 = nn.Conv2d(mid_c, out_c, 1, 1, 0, bias=False)
        self.bn3 = nn.BatchNorm2d(out_c)

    def forward(self, x):
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        out = F.relu(self.bn2(self.conv2(out)), inplace=True)
        out = self.bn3(self.conv3(out))
        # Note: NO addition. Identity is not the default behavior.
        return F.relu(out, inplace=True)
```

## Why it is suboptimal

- The intervention changes block topology but not the learning target;
  the optimum near identity is still hard for the optimizer to reach.
- Bottleneck topology *with* an identity shortcut is the canonical
  ResNet-50/101/152 design — i.e. the bottleneck branch is best
  thought of as orthogonal to the shortcut decision, and the
  shortcut decision is the one that resolves degradation.
