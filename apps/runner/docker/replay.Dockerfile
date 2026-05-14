# Placeholder runner image for `replay` mode.
#
# Replay must be deterministic: no network, CPU-only, fixture sha256s
# verified by the runner before exec. The image stays minimal — bigger ML
# libs go in mini-experiment.Dockerfile.
#
# Real implementation tracked in backlog/08.

# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

RUN rm -rf /root/.bash_history /var/lib/apt/lists/*
RUN useradd --create-home --shell /usr/sbin/nologin sandbox
USER sandbox
WORKDIR /workspace

ENTRYPOINT ["/bin/sh", "-c"]
