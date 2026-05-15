# QA: Starter fails target tests (ResNet ERP)

Date: 2026-05-15
Backlog item: `[backlog/02-erp-content-package.md:71] Ensure starter fails target tests.`

## Scope

Stage S003 of `content/packages/resnet` runs
`pytest workspace/tests/test_residual_block.py -q` against the learner-facing
starter at `content/packages/resnet/workspace/starter/cifar10_resnet.py`. The
package contract is that *every* target test must fail on the unmodified
starter so the learner gets an unambiguous "you need to implement this"
signal, and pass on the canonical solution.

## Defect found before fix

Before this change, two of four target tests passed on the unmodified
starter by coincidence:

- `test_basic_block_preserves_shape_when_dims_match`: starter `forward` returned
  `x`, which trivially preserved shape for the `in==out, stride==1` case.
- `test_basic_block_identity_shortcut_property`: same `return x`, combined with
  a non-negative input, accidentally satisfied `relu(0 + x) == x`.

Pre-fix `pytest` result: `2 failed, 2 passed`.

## Fix

`content/packages/resnet/workspace/starter/cifar10_resnet.py:BasicBlock.forward`
now raises `NotImplementedError` with a hint pointing back to the existing
TODO. The dimension-changing shortcut still returns `nn.Identity()` so that
construction succeeds and `test_basic_block_projection_shortcut_is_present`
fails with its bespoke pedagogical assertion message rather than a constructor
error.

## Verification

Command (run from `content/packages/resnet`):

```
python -m pytest workspace/tests/test_residual_block.py -q
```

Result: `4 failed in 1.00s`.

Failure summary:
- `test_basic_block_preserves_shape_when_dims_match` — `NotImplementedError`
  from `forward` stub.
- `test_basic_block_downsamples_and_doubles_channels` — `NotImplementedError`
  from `forward` stub.
- `test_basic_block_identity_shortcut_property` — `NotImplementedError`
  from `forward` stub.
- `test_basic_block_projection_shortcut_is_present` — assertion: shortcut is
  `nn.Identity()` and exposes no learnable parameters.

## Notes / follow-up

- The companion checkbox at `backlog/02-erp-content-package.md:72`
  ("Ensure canonical solution passes target and previous required stages") is
  still open and intentionally out of scope for this change. The canonical
  solution at `content/packages/resnet/solutions/canonical/cifar10_resnet.py`
  already implements the full block; that item only needs to wire the
  canonical file into the S003 runner path and confirm a green pytest run.
- `workspace/runner.yaml` was not modified.
