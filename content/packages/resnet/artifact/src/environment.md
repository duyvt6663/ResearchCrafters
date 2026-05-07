# Environment

The reference environment for both fixture acquisition and the learner
sandbox.

## Python

- Python 3.11
- PyTorch 2.4
- torchvision 0.19
- numpy 1.26
- pyyaml 6.0

## Hardware

- Fixture acquisition: single NVIDIA T4 or better, 16 GB RAM. CIFAR-10
  ResNet-20 trains in well under an hour; the package author runs it once.
- Learner sandbox: CPU-only. The learner does not retrain; replay-mode
  stages consume cached fixtures.

## Reproducibility knobs

- Set `PYTHONHASHSEED=0`.
- Set `torch.manual_seed(0)` and `numpy.random.seed(0)` in the training
  entrypoint.
- Pin the cuDNN deterministic flag if exact bit-level reproducibility is
  needed for fixture refresh.

## Container

The learner runner uses a minimal Python 3.11 image. See
`workspace/docker/Dockerfile`.
