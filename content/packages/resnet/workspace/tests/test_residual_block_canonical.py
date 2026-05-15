"""Tests that the canonical solution passes the S003 target tests.

Stage S003 runs ``test_residual_block.py`` against the learner-facing
starter, where every assertion must fail until the student implements
``BasicBlock``. This sibling file runs the same four invariants against
the canonical solution at
``content/packages/resnet/solutions/canonical/cifar10_resnet.py`` so CI
catches regressions in the package's reference implementation.

The backlog item that motivates this file is
``backlog/02-erp-content-package.md:72``
("Ensure canonical solution passes target and previous required stages").
"""

from __future__ import annotations

import pytest
import torch

from solutions.canonical.cifar10_resnet import BasicBlock, CifarResNet


def _zero_block(in_channels: int, out_channels: int, stride: int) -> BasicBlock:
    block = BasicBlock(in_channels, out_channels, stride=stride)
    with torch.no_grad():
        block.conv1.weight.zero_()
        block.conv2.weight.zero_()
        block.bn1.running_mean.zero_()
        block.bn1.running_var.fill_(1.0)
        block.bn2.running_mean.zero_()
        block.bn2.running_var.fill_(1.0)
    block.eval()
    return block


def test_canonical_basic_block_preserves_shape_when_dims_match() -> None:
    block = BasicBlock(16, 16, stride=1)
    x = torch.randn(2, 16, 32, 32)
    y = block(x)
    assert y.shape == x.shape


def test_canonical_basic_block_downsamples_and_doubles_channels() -> None:
    block = BasicBlock(16, 32, stride=2)
    x = torch.randn(2, 16, 32, 32)
    y = block(x)
    assert y.shape == (2, 32, 16, 16)


def test_canonical_basic_block_identity_shortcut_property() -> None:
    block = _zero_block(16, 16, stride=1)
    x = torch.relu(torch.randn(2, 16, 32, 32))
    y = block(x)
    assert torch.allclose(y, x, atol=1e-5)


def test_canonical_basic_block_projection_shortcut_is_present() -> None:
    block = BasicBlock(16, 32, stride=2)
    has_params = any(p.requires_grad for p in block.shortcut.parameters())
    assert has_params


def test_canonical_resnet_end_to_end_forward() -> None:
    model = CifarResNet().eval()
    x = torch.randn(2, 3, 32, 32)
    with torch.no_grad():
        logits = model(x)
    assert logits.shape == (2, 10)


if __name__ == "__main__":  # pragma: no cover
    pytest.main([__file__])
