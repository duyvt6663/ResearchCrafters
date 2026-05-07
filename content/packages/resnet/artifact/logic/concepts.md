# Concepts

Vocabulary the learner is assumed to know or to learn from the framing stage
before attempting the decision stage.

## Plain network

A feed-forward stack of convolution → batch norm → ReLU blocks with no
skip connections. Each block computes $H(x)$, an unconstrained mapping.

## Residual block

A block of the form `y = F(x, {W_i}) + x`, where `F` is two or three
weight layers. The addition is elementwise. The shortcut is parameter-free
when the dimensions of $F(x)$ match `x`; otherwise a 1x1 convolution
projection is used.

## Identity shortcut

The parameter-free shortcut path. Adds `x` to $F(x)$. Crucial for keeping
the trivial-identity-mapping reachable by the optimizer.

## Projection shortcut

Used only when $F(x)$ and `x` have different shapes (different channel
counts or spatial resolution after a stride-2 layer). Introduces a 1x1
convolution on the shortcut path.

## Basic block

Two 3x3 convolutions in sequence. Used in ResNet-18 and ResNet-34.

## Bottleneck block

1x1 → 3x3 → 1x1 convolutions. The 1x1 layers reduce and then restore the
channel dimension around the 3x3, sharply lowering FLOPs per block. Used
in ResNet-50/101/152.

## Degradation

A failure mode where deeper plain networks have *higher training error*
than their shallower counterparts. Distinct from overfitting.

## Hypothesis under test

If the optimal mapping for a block is close to identity, an unconstrained
plain block must learn an identity-like function from scratch, while a
residual block need only learn $F(x) ≈ 0$. Under this hypothesis the
residual reformulation should make optimization easier without changing
representational capacity.
