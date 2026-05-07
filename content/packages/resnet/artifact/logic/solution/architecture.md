# Architecture

## Stage diagram (CIFAR-10 ResNet-20)

```
input 32x32x3
  |
  v
conv 3x3, 16 channels, stride 1, BN, ReLU
  |
  v
[basic-block x N]   feature map 32x32, 16 channels
  |
  v
[basic-block x N]   feature map 16x16, 32 channels (first block stride 2)
  |
  v
[basic-block x N]   feature map  8x8 , 64 channels (first block stride 2)
  |
  v
global average pool
  |
  v
fully connected (10 classes)
```

For ResNet-20, `N = 3` so the network has `1 + 6N + 1 = 20` weighted layers
(the 6N counts two convs per basic block across three stages).

## Basic block

```
x ────────────┐
              │ identity (or projection if dims differ)
              v
F(x):  conv 3x3 → BN → ReLU → conv 3x3 → BN
              │
              + x
              v
            ReLU
```

## Bottleneck block

```
x ──────────────────────────┐
                            │ identity (or 1x1 projection)
                            v
F(x):  conv 1x1 (reduce) → BN → ReLU →
       conv 3x3            → BN → ReLU →
       conv 1x1 (restore)  → BN
                            │
                            + x
                            v
                          ReLU
```

## Stride and channel changes

When the first block of a stage halves spatial resolution and doubles channel
count, the shortcut path is a 1x1 convolution with stride 2. Inside a stage,
shortcuts are pure identity.
