# Local Tunnel Hosting

This setup runs ResearchCrafters on this machine and exposes only the Next.js
web app through Cloudflare Tunnel.

## Surface Area

Public:

- `apps/web` on `http://127.0.0.1:3000`, reached through Cloudflare Tunnel.

Private/local only:

- Postgres on `127.0.0.1:5432`
- Redis on `127.0.0.1:6379`
- MinIO API on `127.0.0.1:9000`
- MinIO console on `127.0.0.1:9001`
- Worker and runner processes

Do not publish Postgres, Redis, MinIO, Docker, or SSH through the tunnel.

## Run The App

For active iteration, run the dev server and point the tunnel at that port:

```sh
pnpm dev
```

The normal dev server uses port `3000` and hot-reloads as files change. The
named Cloudflare tunnel can point at `http://127.0.0.1:3000` so the public
domain updates with the same live dev server.

If you want a loopback-only dev server managed outside `pnpm dev`, run:

```sh
RC_PORT=3000 ./infra/scripts/host-dev-local.sh
```

For a production-style local server:

```sh
./infra/scripts/host-local.sh
```

The script loads `.env`, starts Docker Compose, applies Prisma migrations,
builds the web app and its workspace dependencies, and starts Next.js bound to
`127.0.0.1`.

To reseed the local database, run:

```sh
RC_SEED=1 ./infra/scripts/host-local.sh
```

To avoid a local dev server already using port `3000`, choose another loopback
port:

```sh
RC_PORT=3100 ./infra/scripts/host-local.sh
```

## Temporary Tunnel

For a smoke test:

```sh
./infra/scripts/tunnel-quick.sh
```

If the app is running on a non-default port, pass the same `RC_PORT`:

```sh
RC_PORT=3100 ./infra/scripts/tunnel-quick.sh
```

For a detached local run on macOS, `screen` is available:

```sh
screen -ls
screen -S researchcrafters-host -X quit
screen -S researchcrafters-tunnel -X quit
```

Cloudflare prints a temporary `trycloudflare.com` URL. Quick tunnels are useful
for testing, but not for a stable deployment.

## Stable Tunnel

Authenticate this machine:

```sh
cloudflared tunnel login
```

Create and route a named tunnel:

```sh
cloudflared tunnel create researchcrafters
cloudflared tunnel route dns researchcrafters researchcrafters.example.com
```

Copy `infra/cloudflared/researchcrafters.yml.example` to
`~/.cloudflared/researchcrafters.yml`, then replace:

- `tunnel`
- `credentials-file`
- `hostname`

Run it:

```sh
cloudflared tunnel --config ~/.cloudflared/researchcrafters.yml run
```

For GitHub OAuth and CLI callbacks, set these in `.env` to the public URL:

```sh
NEXTAUTH_URL=https://researchcrafters.example.com
RESEARCHCRAFTERS_API_URL=https://researchcrafters.example.com
```

Restart `./infra/scripts/host-local.sh` after changing `.env`.

## Main Branch Refresh

The public tunnel should point at a clean main deployment worktree, not an
active agent or human feature branch. The Skynet main-sync hook uses the
configured target repository as the git remote/worktree host, then maintains a
sibling deployment worktree:

```text
/Users/duyvt6663/github/ResearchCrafters       # active development checkout
/Users/duyvt6663/github/ResearchCrafters-main  # managed main deployment
```

On every push to `main`, `.github/workflows/telegram-notify.yml` posts to
GoClaw's `/v1/beta/skynet-workflows/main-sync` hook. GoClaw fetches `origin`,
fast-forwards the clean deployment worktree, and restarts the managed
`screen` session `researchcrafters-host-main` through `infra/scripts/host-local.sh`.

The refresh refuses to overwrite local edits in the deployment worktree and
refuses to take over port `3000` if an unmanaged process is already listening.
Stop any ad-hoc dev server before relying on the automatic main deployment:

```sh
screen -S researchcrafters-host-main -X quit
lsof -tiTCP:3000 -sTCP:LISTEN
```

Optional GitHub secrets:

- `GOCLAW_SKYNET_DEPLOY_REPO` — override the deployment worktree path.
- `GOCLAW_SKYNET_WEB_PORT` — override the tunnel target port.

## Notes

- Keep `RUNNER_DOCKER_ENABLED=false` until the Docker sandbox is implemented
  and hardened.
- Replace `NEXTAUTH_SECRET` and `RUNNER_CALLBACK_SECRET` before sharing the app
  beyond a private alpha.
- Keep this machine awake while hosting. If it sleeps, the app and tunnel go
  offline.
