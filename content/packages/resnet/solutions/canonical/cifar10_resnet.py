"""Canonical solution for the CIFAR-10 ResNet stage.

This file shows what `workspace/starter/cifar10_resnet.py` should look
like once the residual block is correctly implemented. The training
loop is intentionally minimal — the package's S004 stage replays a
cached fixture rather than running a full trainer.

This file MUST NOT be served to the AI mentor or evaluator before stage
S003 passes. The mentor context builder enforces this via the package's
`stage_policy.canonical_solution: after_pass` setting.
"""

from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F


class BasicBlock(nn.Module):
    """Two-conv basic residual block (canonical)."""

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
        if stride == 1 and in_channels == out_channels:
            return nn.Identity()
        return nn.Sequential(
            nn.Conv2d(
                in_channels,
                out_channels,
                kernel_size=1,
                stride=stride,
                bias=False,
            ),
            nn.BatchNorm2d(out_channels),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.conv1(x)
        out = self.bn1(out)
        out = F.relu(out, inplace=True)
        out = self.conv2(out)
        out = self.bn2(out)
        identity = self.shortcut(x)
        out = out + identity
        out = F.relu(out, inplace=True)
        return out


class CifarResNet(nn.Module):
    """A small ResNet for CIFAR-10 (canonical)."""

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
        self._init_weights()

    def _make_stage(self, out_channels: int, n_blocks: int, stride: int) -> nn.Sequential:
        layers: list[nn.Module] = []
        strides = [stride] + [1] * (n_blocks - 1)
        for s in strides:
            layers.append(BasicBlock(self.in_channels, out_channels, stride=s))
            self.in_channels = out_channels
        return nn.Sequential(*layers)

    def _init_weights(self) -> None:
        for module in self.modules():
            if isinstance(module, nn.Conv2d):
                nn.init.kaiming_normal_(
                    module.weight, mode="fan_out", nonlinearity="relu"
                )
            elif isinstance(module, nn.BatchNorm2d):
                nn.init.constant_(module.weight, 1.0)
                nn.init.constant_(module.bias, 0.0)
            elif isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, std=0.01)
                nn.init.constant_(module.bias, 0.0)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.stage1(x)
        x = self.stage2(x)
        x = self.stage3(x)
        x = F.adaptive_avg_pool2d(x, 1).flatten(1)
        return self.head(x)


def train_one_epoch(model, loader, optimizer, loss_fn, device):
    """Minimal canonical training step.

    This is intentionally a one-epoch helper. The full CIFAR-10 trainer
    that produced the S004 fixture lives in fixture-acquisition tooling
    and is not needed for the learner runner.
    """
    model.train()
    total_loss = 0.0
    correct = 0
    total = 0
    for x_batch, y_batch in loader:
        x_batch = x_batch.to(device, non_blocking=True)
        y_batch = y_batch.to(device, non_blocking=True)
        logits = model(x_batch)
        loss = loss_fn(logits, y_batch)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * x_batch.size(0)
        correct += (logits.argmax(dim=1) == y_batch).sum().item()
        total += x_batch.size(0)
    return {
        "train_loss": total_loss / max(total, 1),
        "train_err": 1.0 - correct / max(total, 1),
    }
