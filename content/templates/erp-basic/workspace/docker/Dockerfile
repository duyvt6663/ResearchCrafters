# Placeholder runner image (template).
#
# Build:
#   docker build -t researchcrafters-<your-slug>:dev workspace/docker

FROM researchcrafters/runner-python:3.11-slim

# TODO: pin learner-facing dependencies needed by your starter and tests.
RUN pip install --no-cache-dir "pytest==8.*"

WORKDIR /workspace
