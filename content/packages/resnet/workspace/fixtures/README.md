# Fixtures: regeneration recipe

Replay-mode stages consume cached fixtures. The runner refuses to
execute a replay stage if any declared fixture hash mismatches. To
regenerate a fixture, follow the recipe below and update the SHA-256 in
`workspace/runner.yaml`.

## Hardware

- **Required**: a single NVIDIA T4 (or equivalent) GPU with 16 GB system
  RAM. CIFAR-10 ResNet-20 trains in well under an hour at batch size 128.
- **Not required**: a multi-GPU machine. Fixture acquisition is not
  parallelized.

## Software

- Python 3.11
- PyTorch 2.4 (CUDA 12.1 wheels for the T4 build)
- torchvision 0.19
- numpy 1.26

## Reproducibility

- `PYTHONHASHSEED=0`
- `torch.manual_seed(0)`, `numpy.random.seed(0)`
- `torch.backends.cudnn.deterministic = True`
- `torch.backends.cudnn.benchmark = False`

## Command (illustrative)

The actual regeneration script lives in
`artifact/src/execution/` (placeholder); adapt the command as the
script becomes real.

```
python -m experiments.cifar10_train \
    --config artifact/src/configs/cifar10_resnet20.yaml \
    --variant residual \
    --seed 0 \
    --output workspace/fixtures/stage-004/training_log.json

python -m experiments.cifar10_train \
    --config artifact/src/configs/cifar10_plain20.yaml \
    --variant plain \
    --seed 0 \
    --append workspace/fixtures/stage-004/training_log.json
```

## Provenance fields to record

For every regenerated fixture, the maintainer must record (inline at the
top of the fixture JSON or in a sidecar `*.provenance.json`):

- `hardware`: GPU model, host machine, RAM
- `command`: exact command run
- `environment`: `pip freeze` output (or a hash thereof)
- `git_sha`: commit at fixture-acquisition time
- `date`: ISO 8601 timestamp
- `seed`: random seed used

## Hash update

```
shasum -a 256 workspace/fixtures/stage-004/training_log.json
# copy the value into the matching `sha256:` field in workspace/runner.yaml
```

## Refresh cadence

The package metadata declares an `annual` fixture refresh cadence. A
maintainer should regenerate fixtures yearly *or* whenever PyTorch /
CUDA / cuDNN versions change in a way that alters the produced numbers.
