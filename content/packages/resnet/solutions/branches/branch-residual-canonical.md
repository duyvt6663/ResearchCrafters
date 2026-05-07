# Canonical branch — Residual learning

## Choice (visible to learners)

> Reformulate each block as `H(x) = F(x) + x`, where `F` is the learned
> residual and `+ x` is an identity shortcut. Increase depth, train end-to-end.

## Why this is canonical

This is the move the original ResNet paper makes. It is *not* obvious from
the framing alone — the surprising-result framing in §1 strongly suggests
"the deeper net should be at least as good as the shallower one because the
extra layers can always learn identity," and yet plain stacks at depth 56
underperform plain stacks at depth 20 on training error. Two things make
the residual reformulation the right answer:

1. **Optimisation reason.** When the optimal mapping for a block is close
   to identity (or any low-norm perturbation of it), driving `F` toward
   zero is far easier than learning identity from scratch through a
   nonlinear stack. The reparameterisation moves the *easy* solution to
   the *initialisation distribution*.
2. **Gradient reason.** `dH/dx = dF/dx + 1`. The constant `1` survives
   backprop through every block, so signal still flows through the
   shortcut even when `dF/dx` is small. Stacks of 50+ blocks remain
   trainable end-to-end without auxiliary losses or careful warm-up.

Both reasons are present in the paper. Together they predict — and the
CIFAR-10 fixture confirms — that residual stacks at depth 56 should
outperform plain stacks at depth 20 on training error, while plain stacks
at depth 56 lose ground.

## Evidence link (mentor visibility: `after_pass`)

- `artifact/logic/claims.md#identity-is-the-trick`
- `artifact/logic/solution/algorithm.md`
- `artifact/evidence/tables/training-curves.md#plain-vs-residual`
- `workspace/fixtures/stage-004/training_log.json`:
  - `plain-20.final.train_err = 0.060`
  - `plain-56.final.train_err = 0.080` (the degradation)
  - `residual-20.final.train_err = 0.050`
  - `residual-56.final.train_err = 0.030` (residual recovers and improves)

## What this branch does NOT claim

- It does not claim residual learning solves vanishing gradients in the
  pre-ReLU sense; the paper is explicit that the failure mode at depth 56
  in the plain net is *not* a gradient-magnitude failure (BatchNorm keeps
  gradients well-behaved). The improvement is an *optimisation
  reparameterisation*, not a numerical fix. See
  `claims.md#vanishing-gradients-not-the-cause`.
- It does not claim shortcuts add capacity. The function class is the
  same; only the parameterisation changes.

## Lesson surfaced to the learner

A solution that looks like an identity reparameterisation can be the
correct answer even when the surface intuition is "we just need more
capacity" or "we need a deeper non-linearity stack." The right test is
whether the easy solution lives near the initialisation distribution — if
it does, reformulate the problem so the optimiser starts from there.

## When this branch is unlocked

Per `stage_policy.mentor_visibility.canonical_solution: after_pass` on
S002, this file is shown to a learner only after they pass the decision
stage's rubric. Mentor context never loads it before that gate.
