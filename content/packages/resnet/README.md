# ResNet: Deep Residual Learning for Image Recognition

The flagship ResearchCrafters Executable Research Package. You will reconstruct
the central decision behind ResNet: when stacking more layers stops helping,
what should you do?

## Promise

In about three hours of focused practice, you will frame the degradation
problem, choose between three plausible research branches (one canonical, one
failed, one suboptimal), implement a residual block, run a replay-mode CIFAR-10
training analysis, and write a precise claim grounded in evidence — not a paper
summary.

## Rationale

ResNet is famous for a reason most learners never feel: deeper plain networks
trained worse than shallower ones, even on training data. Engineers who only
read the paper memorize "skip connections fix vanishing gradients" without ever
seeing the failure mode the residual formulation was actually designed to solve.
This package replays that decision so you can feel why `F(x) + x` is a
hypothesis about optimization, not just a regularization trick.

## Start

Open `curriculum/graph.yaml` and begin at stage `S001`. Stages `S001` and
`S002` are free preview content per `package.yaml`.
