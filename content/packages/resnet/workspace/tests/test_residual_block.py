"""Tests for the BasicBlock residual implementation.

These tests target stage S003. They must fail on the unmodified starter
and pass on the canonical solution. They check three invariants:

1. Shape preservation when ``in_channels == out_channels`` and
   ``stride == 1``.
2. Shape transformation when ``stride == 2`` and channels double.
3. The identity-shortcut property: when ``F(x)`` is identically zero,
   the block output (after the post-addition ReLU) equals
   ``relu(shortcut(x))``. With the default identity shortcut and
   non-negative input, this means the block reproduces ``x``.
"""

from __future__ import annotations

import pytest
import torch

from workspace.starter.cifar10_resnet import BasicBlock


def _zero_block(in_channels: int, out_channels: int, stride: int) -> BasicBlock:
    block = BasicBlock(in_channels, out_channels, stride=stride)
    # Force F(x) = 0 by zero-ing the weights of the residual path.
    with torch.no_grad():
        block.conv1.weight.zero_()
        block.conv2.weight.zero_()
        # BatchNorm in eval mode is the identity when running stats are
        # zero/one and weight/bias are unchanged. We use eval() and reset
        # running stats to ensure that.
        block.bn1.running_mean.zero_()
        block.bn1.running_var.fill_(1.0)
        block.bn2.running_mean.zero_()
        block.bn2.running_var.fill_(1.0)
    block.eval()
    return block


def test_basic_block_preserves_shape_when_dims_match() -> None:
    block = BasicBlock(16, 16, stride=1)
    x = torch.randn(2, 16, 32, 32)
    y = block(x)
    assert y.shape == x.shape, (
        "BasicBlock with matched channels and stride=1 must preserve input shape."
    )


def test_basic_block_downsamples_and_doubles_channels() -> None:
    block = BasicBlock(16, 32, stride=2)
    x = torch.randn(2, 16, 32, 32)
    y = block(x)
    assert y.shape == (2, 32, 16, 16), (
        "BasicBlock with stride=2 and channels 16->32 must produce a "
        "tensor of shape (B, 32, 16, 16) for a (B, 16, 32, 32) input."
    )


def test_basic_block_identity_shortcut_property() -> None:
    block = _zero_block(16, 16, stride=1)
    x = torch.relu(torch.randn(2, 16, 32, 32))  # ensure non-negative input
    y = block(x)
    # With F(x) = 0 and identity shortcut, the block computes relu(0 + x) = x
    # for non-negative x.
    assert torch.allclose(y, x, atol=1e-5), (
        "When F(x) = 0 and the shortcut is identity, BasicBlock(x) must "
        "equal relu(x). The starter's forward pass is missing the addition."
    )


def test_basic_block_projection_shortcut_is_present() -> None:
    block = BasicBlock(16, 32, stride=2)
    has_params = any(p.requires_grad for p in block.shortcut.parameters())
    assert has_params, (
        "When dimensions change, the shortcut must be a learnable 1x1 "
        "convolution, not nn.Identity()."
    )


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__])
