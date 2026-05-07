# branch-deeper-no-residual (failed)

## Narrative

The "just go deeper" branch is the most natural pre-ResNet response: if
ten layers help, twenty must help more, and BatchNorm plus He
initialization should keep the optimizer out of trouble. The branch is
labeled *failed* because the package's evidence
(`artifact/evidence/tables/training-curves.md#plain-vs-residual`) shows
plain-56 with strictly higher *training* error than plain-20 — the
opposite of the depth dividend the branch predicts.

The reason this is a failure of *optimization* rather than *capacity*
is the same argument that frames the package: a deeper network can
always represent a shallower network by setting the extra layers to
identity, so the failure to recover the shallower function is the
optimizer not finding what the network is capable of representing.

## Sketch

A representative implementation of this branch — a plain CifarResNet
with no shortcut — looks like this. We include it for didactic
contrast; do not paste it into the starter.

```python
class PlainBlock(nn.Module):
    def __init__(self, in_c, out_c, stride):
        super().__init__()
        self.conv1 = nn.Conv2d(in_c, out_c, 3, stride, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(out_c)
        self.conv2 = nn.Conv2d(out_c, out_c, 3, 1, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(out_c)

    def forward(self, x):
        out = F.relu(self.bn1(self.conv1(x)), inplace=True)
        out = self.bn2(self.conv2(out))
        # Note: NO addition. The block fully owns its function.
        return F.relu(out, inplace=True)
```

## Why it fails

- Plain-56 has higher training error than plain-20 in
  `workspace/fixtures/stage-004/training_log.json`.
- The capacity-side argument predicts the opposite, so the failure is
  optimization-side.
- BatchNorm is on, so the failure is *not* gradient scale.
