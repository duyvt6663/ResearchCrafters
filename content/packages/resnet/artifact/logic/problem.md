# Problem: The Degradation Phenomenon

## What is observed

When plain feed-forward convolutional networks (no skip connections) are made
deeper — for example moving from 20 to 56 layers on CIFAR-10 — the training
error stops decreasing and in fact starts to *increase*. This is not the
usual overfitting story: training error rises along with test error.

This contradicts the naive expectation that a deeper network can always
represent at least the function of its shallower counterpart by setting the
extra layers to identity.

## Why it matters

If extra capacity strictly increases representational power, the optimizer
should at minimum recover the shallower network. The fact that it does not
implies the failure is *optimization-side*, not capacity-side.

The paper introduces this as the **degradation problem**.

## Anchor: O01

The observation referenced as `O01` in this package is:

> Stacking more layers in a plain CNN beyond a certain depth degrades both
> training and test error on CIFAR-10 and ImageNet, despite increased capacity.

See `claims.md#degradation` for the precise claim and its source reference.

## Constraints on a fix

A successful fix must:

- Allow networks of 50, 100, or 1000 layers to train without degradation.
- Add minimal parameters per added layer.
- Preserve the existing convolutional building blocks (so it can be retrofitted
  onto VGG-style stacks).
- Not require pre-training, gating, or learned routing.
