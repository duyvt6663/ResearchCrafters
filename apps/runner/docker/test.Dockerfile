# Placeholder runner image for `test` mode.
#
# Per backlog/08-infra-foundations.md:
#   - pin all images by digest, not tag,
#   - run image scans in CI; reject high-severity CVEs,
#   - strip secrets and shell history,
#   - read-only base + writable workspace mount.
#
# Real implementation tracked in backlog/08.

# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS base

# Drop shell history & remove apt caches as part of the slim layer.
RUN rm -rf /root/.bash_history /var/lib/apt/lists/*

# Non-root sandbox user. Workspace is the only writable mount.
RUN useradd --create-home --shell /usr/sbin/nologin sandbox
USER sandbox
WORKDIR /workspace

ENTRYPOINT ["/bin/sh", "-c"]
