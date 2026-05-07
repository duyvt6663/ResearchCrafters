# Execution Recipes (placeholder)

Reference commands the maintainer would run to regenerate the cached
fixtures used by replay-mode stages. None of these execute inside the
learner runner; the learner runner runs the lightweight starter or the
reference solution against the *cached* outputs.

## Regenerate stage S004 fixture

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

The actual regeneration script is not yet checked in; this is a placeholder
showing the intended interface. The fixture currently in
`workspace/fixtures/stage-004/training_log.json` is hand-authored as a
representative shape so the curriculum can be built before fixture
acquisition is complete. See `workspace/fixtures/README.md` for the
regeneration policy.
