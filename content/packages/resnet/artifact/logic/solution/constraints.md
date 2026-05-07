# Constraints and Invariants

The residual block design is constrained by several invariants that students
should be able to recognize when reading or writing residual code.

## Shape invariants

- `F(x)` and the shortcut path must produce tensors of identical shape before
  the addition. Mismatch is an error, not something the framework will paper
  over.
- The shortcut is identity when `F(x).shape == x.shape`. Otherwise it is the
  *minimum* parameter projection needed to match shape — typically a 1x1
  convolution with appropriate stride.

## Topological invariants

- The addition of `x` happens *before* the post-addition activation, not
  after. Adding after the final activation is a different architecture
  (and was empirically worse in follow-up work).
- BatchNorm is applied to `F(x)` only, not to the shortcut path.

## Optimization invariants

- The identity mapping must remain reachable: the optimizer should be able to
  drive `F(x) → 0` and recover identity. This is the invariant the
  re-parameterization is designed to preserve.
- Weight decay is applied to convolution weights; biases and BN parameters
  follow project conventions. The package follows the original paper and
  applies weight decay to convolutional weights.

## Budget invariants

- Adding a basic block adds at most `2 * 3 * 3 * C * C + 2 * 2C` parameters
  (two 3x3 convs plus BN affine parameters at `C` channels). The shortcut
  contributes zero unless dimensions change.
- Bottleneck blocks trade a 3x3 at full width for 1x1 reduce + 3x3 at low
  width + 1x1 expand, lowering parameters per unit of effective depth.
