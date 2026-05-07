"""CIFAR-10 ResNet starter scaffold.

This file is the learner-facing starter. It is intentionally incomplete:
the residual block forward pass and the dimension-changing shortcut are
left as TODOs. The unit tests in
``workspace/tests/test_residual_block.py`` will fail until both are
filled in correctly.

Do not implement the full training loop here. The CIFAR-10 replay stage
consumes a cached fixture instead.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class BasicBlock(nn.Module):
    """Two-conv basic residual block.

    Implements ``y = relu(F(x) + shortcut(x))`` where ``F`` is two 3x3
    convolutions with BatchNorm and a ReLU between them, and the shortcut
    is identity when shapes match or a 1x1 projection conv when they do
    not.
    """

    expansion = 1

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(
            in_channels,
            out_channels,
            kernel_size=3,
            stride=stride,
            padding=1,
            bias=False,
        )
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.conv2 = nn.Conv2d(
            out_channels,
            out_channels,
            kernel_size=3,
            stride=1,
            padding=1,
            bias=False,
        )
        self.bn2 = nn.BatchNorm2d(out_channels)
        self.shortcut = self._make_shortcut(in_channels, out_channels, stride)

    @staticmethod
    def _make_shortcut(in_channels: int, out_channels: int, stride: int) -> nn.Module:
        """Build the shortcut path.

        TODO(student): return ``nn.Identity()`` when the shapes already
        match (``stride == 1`` and ``in_channels == out_channels``),
        otherwise return a 1x1 conv with the given stride followed by
        BatchNorm. Hint: use ``nn.Sequential``.
        """
        # TODO(student): replace this stub.
        return nn.Identity()

    def forward(self, x: torch.Tensor) -> torch.Tensor:  # noqa: D401
        """Forward pass through the residual block.

        TODO(student): apply conv1, bn1, ReLU, conv2, bn2, then add the
        shortcut path, then apply a final ReLU. Make sure the addition
        happens *before* the final activation.
        """
        # TODO(student): replace this stub with the residual computation.
        return x


class CifarResNet(nn.Module):
    """A small ResNet for CIFAR-10.

    The default configuration ``num_blocks=(3, 3, 3)`` produces a
    ResNet-20-like network: an initial 3x3 conv plus three stages of
    three basic blocks each, plus a final fully connected layer.
    """

    def __init__(
        self,
        num_blocks: tuple[int, int, int] = (3, 3, 3),
        num_classes: int = 10,
    ) -> None:
        super().__init__()
        self.in_channels = 16
        self.stem = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, stride=1, padding=1, bias=False),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=True),
        )
        self.stage1 = self._make_stage(16, num_blocks[0], stride=1)
        self.stage2 = self._make_stage(32, num_blocks[1], stride=2)
        self.stage3 = self._make_stage(64, num_blocks[2], stride=2)
        self.head = nn.Linear(64, num_classes)

    def _make_stage(self, out_channels: int, n_blocks: int, stride: int) -> nn.Sequential:
        layers: list[nn.Module] = []
        strides = [stride] + [1] * (n_blocks - 1)
        for s in strides:
            layers.append(BasicBlock(self.in_channels, out_channels, stride=s))
            self.in_channels = out_channels
        return nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.stage1(x)
        x = self.stage2(x)
        x = self.stage3(x)
        x = F.adaptive_avg_pool2d(x, 1).flatten(1)
        return self.head(x)


def train_one_epoch(model, loader, optimizer, loss_fn, device):  # pragma: no cover
    """Placeholder training loop.

    The package does not run a full CIFAR-10 trainer in the learner
    sandbox. Stage S004 replays a cached training log instead. This
    function exists so the canonical solution can demonstrate the shape
    of a real loop without making the starter executable.
    """
    raise NotImplementedError(
        "Training loop is not implemented in the starter. "
        "Stage S004 replays workspace/fixtures/stage-004/training_log.json."
    )
