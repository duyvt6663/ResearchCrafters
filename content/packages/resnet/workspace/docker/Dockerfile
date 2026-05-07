# Placeholder runner image for the ResNet ERP.
#
# The platform's runner base image is `researchcrafters/runner-python:3.11-slim`
# (see workspace/runner.yaml `image:`). This Dockerfile exists so a maintainer
# can rebuild a package-pinned variant if a learner submission needs additional
# system libraries or a different PyTorch wheel.
#
# Build:
#   docker build -t researchcrafters-resnet:dev workspace/docker
#
# The runner sandbox imposes the resource caps; this Dockerfile should not
# attempt to set them.

FROM researchcrafters/runner-python:3.11-slim

# Pin learner-facing dependencies. CPU-only for the sandbox: replay-mode stages
# do not run training.
RUN pip install --no-cache-dir \
    "torch==2.4.*" \
    "torchvision==0.19.*" \
    "numpy==1.26.*" \
    "pyyaml==6.0.*" \
    "pytest==8.*"

# Default workdir matches the package layout. The runner mounts the package
# read-only on top of this path.
WORKDIR /workspace

# No CMD: the runner injects the per-stage command from workspace/runner.yaml.
