# apps/

Runnable services and user-facing apps.

## Contents

- `web/` — learner web app (Next.js).
- `runner/` — sandbox runner for code/experiment stages.

## Deferred

- `api/` — split from `web/` route handlers when background pressure appears.
- `worker/` — BullMQ worker process; split from `web/` when jobs grow.
- `authoring/` — Phase 4 authoring workbench.

See `SCAFFOLD.md` at the repo root for the folder ↔ TODO map.
