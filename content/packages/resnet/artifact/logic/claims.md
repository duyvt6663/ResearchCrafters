# Claims

Each claim is anchored. Anchors are referenced from stage `source_refs`,
branch `evidence_refs`, and rubric criteria. Do not rename an anchor without
updating every reference.

## #degradation

**Claim.** Stacking more layers in a plain CNN past a certain depth produces
*higher* training error than a shallower counterpart, on both CIFAR-10 and
ImageNet.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Section 1, Figure 1 (training error of plain 20-layer vs 56-layer on CIFAR-10)."
  - "ResNet paper, Section 4.1 'ImageNet Classification', Table 2 (plain-18 vs plain-34)."
- `evidence_refs`:
  - `artifact/evidence/tables/training-curves.md#plain-vs-residual`

## #not-overfitting

**Claim.** Degradation is not overfitting — the deeper plain network has
higher *training* error too.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Section 1, paragraph following Figure 1."

## #residual-helps

**Claim.** Re-parameterizing each block to learn a residual mapping
`F(x) + x` allows networks of 50–152 layers to train *without* degradation
and to outperform their plain counterparts at matched depth.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Section 3 'Deep Residual Learning' and Section 4.1 Table 2 (ResNet-18 vs ResNet-34)."
- `evidence_refs`:
  - `artifact/evidence/tables/training-curves.md#plain-vs-residual`

## #identity-is-the-trick

**Claim.** The shortcut connection is parameter-free identity (or a 1x1
projection only when dimensions change). The optimization advantage does not
come from extra parameters — it comes from the optimizer being able to drive
`F(x)` toward zero when the optimal mapping is close to identity.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Section 3.1 'Residual Learning' and Section 3.2 'Identity Mapping by Shortcuts'."

## #bottleneck-tradeoff

**Claim.** The bottleneck block (1x1 → 3x3 → 1x1) reduces parameter count and
compute per unit of depth, enabling 50/101/152-layer networks at a comparable
budget to the basic block. Without the identity shortcut, however, bottleneck
alone does not solve degradation.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Section 4.1 'Deeper Bottleneck Architectures'."
- `evidence_refs`:
  - `artifact/evidence/tables/training-curves.md#bottleneck-vs-basic`

## #vanishing-gradients-not-the-cause

**Claim.** Plain deep networks here use batch normalization, so vanishing
gradients are *not* the proximate cause of degradation. Optimization
difficulty appears to be intrinsic to the plain stack at depth.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Section 1 (BN ensures forward/backward signals have non-vanishing variance) and Section 4.1."

## #branch-deeper-fails

**Claim.** Naively adding more plain layers without a shortcut connection
fails to solve degradation; expected gains do not materialize.

- `support_level`: explicit
- `source_refs`:
  - "ResNet paper, Figure 1 and Section 4.1 (plain-34 underperforms plain-18 in training error)."

## #branch-bottleneck-without-shortcut

**Claim.** A bottleneck block without an identity shortcut still suffers
degradation; it is the shortcut, not the bottleneck, that resolves the
optimization failure.

- `support_level`: expert_reconstructed
- `source_refs`:
  - "ResNet paper, Section 3.2–3.3 — explicit statement that residual formulation is the key change; bottleneck without shortcut is not run as a separate ablation in the paper, but the framing implies it."
- `expert_reconstruction_note`: |
    The paper does not run a controlled ablation of "bottleneck without
    shortcut" because the authors had already established that shortcut is the
    operative mechanism. We reconstruct this branch as a teaching tool to
    isolate the contribution of the shortcut from the contribution of the
    bottleneck topology.
