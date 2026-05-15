# QA: Canonical solution passes target tests (ResNet ERP)

Date: 2026-05-15
Backlog item: `[backlog/02-erp-content-package.md:72] Ensure canonical solution passes target and previous required stages.`

## Scope

Stage S003 of `content/packages/resnet` is the only executable stage at or
before S003 — S001 and S002 are declared `mode: none` in
`workspace/runner.yaml`. S003 runs
`pytest workspace/tests/test_residual_block.py -q` against the learner-facing
starter, which must fail 4/4 (covered by
`qa/starter-fails-target-tests-2026-05-15.md`). The package contract also
requires the canonical solution at
`content/packages/resnet/solutions/canonical/cifar10_resnet.py` to satisfy
the same four invariants — that gate did not exist in the test suite
until this change.

## Change

New file: `content/packages/resnet/workspace/tests/test_residual_block_canonical.py`.

It imports `BasicBlock` and `CifarResNet` from `solutions.canonical.cifar10_resnet`
and runs the same four S003 invariants as `test_residual_block.py`, plus one
end-to-end forward check on `CifarResNet`:

1. Shape preservation when `in_channels == out_channels` and `stride == 1`.
2. Shape transformation when `stride == 2` and channels double (16 -> 32).
3. Identity-shortcut property: with `F(x) = 0`, identity shortcut, and
   non-negative input, the block returns `x`.
4. Projection shortcut is a learnable 1x1 conv (not `nn.Identity`) when
   dimensions change.
5. `CifarResNet().eval()` forward on `(2, 3, 32, 32)` produces logits of
   shape `(2, 10)`.

No source files in `solutions/canonical/` or `workspace/starter/` were modified;
the canonical implementation already satisfied every invariant — what was
missing was an executable gate that proves it.

## Verification

Run from `content/packages/resnet`:

```
python -m pytest workspace/tests/ -q
```

Result: `4 failed, 5 passed in 0.94s`.

Breakdown:
- `test_residual_block.py` (starter, must fail) — 4 failed, as required.
- `test_residual_block_canonical.py` (canonical, must pass) — 5 passed.

Canonical-only run:

```
python -m pytest workspace/tests/test_residual_block_canonical.py -q
```

Result: `5 passed in 0.85s`.

## Notes / follow-up

- S001 and S002 are non-executable (`mode: none`) so the "previous required
  stages" clause reduces to S003 today. If a future iteration promotes S001
  or S002 to an executable mode, this QA item should be revisited.
- The S004 replay stage is gated on a placeholder fixture (see the still-open
  bullets at `backlog/02-erp-content-package.md:82-91`) and is out of scope
  for this canonical-correctness check.
