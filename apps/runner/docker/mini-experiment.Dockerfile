# Placeholder runner image for `mini_experiment` mode.
#
# CPU-only for MVP per backlog/03 and backlog/08. GPU-backed mini-experiments
# are a Phase 5 paid/team feature and will live in a separate Dockerfile
# when justified by demand.
#
# Real implementation tracked in backlog/08.

# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

# Common ML libs go here when wired up — keep deps pinned by hash.
# RUN pip install --require-hashes --no-cache-dir -r /tmp/requirements.txt

RUN rm -rf /root/.bash_history /var/lib/apt/lists/*
RUN useradd --create-home --shell /usr/sbin/nologin sandbox
USER sandbox
WORKDIR /workspace

ENTRYPOINT ["/bin/sh", "-c"]
