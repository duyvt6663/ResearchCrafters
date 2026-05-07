# Algorithm

## Forward pass through a basic residual block

```
function basic_block_forward(x, conv1, bn1, conv2, bn2, shortcut):
    out = conv1(x)
    out = bn1(out)
    out = relu(out)
    out = conv2(out)
    out = bn2(out)
    if shortcut is None:
        residual = x
    else:
        residual = shortcut(x)   # 1x1 conv when dims differ
    out = out + residual
    out = relu(out)
    return out
```

## Backward pass intuition

Because the shortcut path is identity, the gradient of the loss with respect
to the input of a residual block decomposes as:

```
dL/dx = dL/dy * (1 + dF/dx)
```

The constant `1` term keeps the gradient signal alive even when `dF/dx` is
small, which is why the residual reformulation is sometimes described as
giving the optimizer "permission to do nothing" at a layer.

## Reference training loop (CIFAR-10)

This is replicated in stub form in `workspace/starter/cifar10_resnet.py` and
canonically in `solutions/canonical/cifar10_resnet.py`.

```
for epoch in range(num_epochs):
    for x_batch, y_batch in train_loader:
        logits = model(x_batch)
        loss = cross_entropy(logits, y_batch)
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()
    log(epoch, train_loss, train_err, test_err)
```

Important details (see `heuristics.md`):

- SGD with momentum, weight decay, learning rate schedule (step decay).
- Standard CIFAR-10 augmentation: pad-and-crop and horizontal flip.
- Batch normalization in every block.
