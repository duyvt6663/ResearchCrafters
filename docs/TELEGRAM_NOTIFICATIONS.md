# Telegram Notifications

This repo has `.github/workflows/telegram-notify.yml` for sending GitHub activity to a Telegram channel.

It currently notifies on:

- completed `CI` and `Lighthouse` workflow runs, including pull request failures
- pull request opened, reopened, synchronized, drafted, ready for review, merged, and closed events
- new issue and pull request comments
- submitted pull request reviews
- new pull request code review comments
- deployment status updates
- manual `workflow_dispatch` test runs

## Setup

1. Create a Telegram bot with BotFather and copy the bot token.
2. Add the bot to the Telegram channel that should receive notifications. For private channels, make the bot an admin.
3. Find the channel chat id.
   - Public channel: use the channel username, for example `@researchcrafters_ci`.
   - Private channel: post one message in the channel, then call `getUpdates` for the bot and use the numeric chat id, usually starting with `-100`.
4. Add these GitHub repository secrets under `Settings -> Secrets and variables -> Actions`:
   - `TELEGRAM_BOT_TOKEN`: the BotFather token.
   - `TELEGRAM_CHAT_ID`: the Telegram channel id or public channel username.
   - `TELEGRAM_THREAD_ID`: optional topic id for Telegram forum topics.
5. Optional, for automatic Skynet CI-fixer dispatch on failed workflow runs:
   - `GOCLAW_SKYNET_HOOK_URL`: a GoClaw URL reachable from GitHub Actions. This can be the base URL, for example `https://goclaw.example.com`, or the full `/v1/beta/skynet-workflows/cicd-failure` endpoint.
   - `GOCLAW_SKYNET_HOOK_TOKEN`: a GoClaw gateway token or API key with operator/write access.
   - `GOCLAW_SKYNET_TARGET_REPO`: optional local target repo path as GoClaw sees it, for example `/Users/duyvt6663/github/ResearchCrafters`.
   - `GOCLAW_SKYNET_CHANNEL`, `GOCLAW_SKYNET_CHAT_ID`, `GOCLAW_SKYNET_LOCAL_KEY`, `GOCLAW_SKYNET_PEER_KIND`: optional overrides for where GoClaw should report the agent run. Leave unset to use GoClaw's configured Skynet channel.
6. In GitHub Actions, run `Telegram Notifications` manually from the Actions tab to verify the channel receives a test message.

## Adding CD Workflows

The workflow watches completed runs of workflows named `CI` and `Lighthouse`. If this repo later adds deployment workflows, add their exact workflow names here:

```yaml
on:
  workflow_run:
    workflows: ['CI', 'Lighthouse', 'Deploy']
    types: [completed]
```

Keep this notification workflow separate from CI/CD jobs. It does not check out or execute pull request code, so it can safely send notifications after CI runs complete.

## Pull Request Safety

Pull request lifecycle notifications use `pull_request_target` so repository secrets are available even for fork-origin PR metadata. This workflow must stay metadata-only: do not add checkout steps, dependency installs, test commands, or any execution of pull request code to it.

CI pass/fail notifications use `workflow_run` after the `CI` or `Lighthouse` workflow completes. That is the failure path to rely on for fork PRs and Dependabot-style PRs.

## Skynet CI Fixer

Telegram messages are outbound notifications only. They do not by themselves spawn a Skynet repair agent, because the GitHub Action sends those messages through the Telegram Bot API rather than through an inbound message that GoClaw consumes.

When `GOCLAW_SKYNET_HOOK_URL` and `GOCLAW_SKYNET_HOOK_TOKEN` are configured, failed `workflow_run` events call GoClaw's Skynet CI-failure endpoint. GoClaw then dispatches the `skynet-ci-fixer` agent against the configured local target repository.

The hook URL must be reachable from the GitHub runner. For GitHub-hosted runners, that usually means a public HTTPS tunnel or a deployed GoClaw gateway. For a self-hosted runner on the same machine as GoClaw, the URL can point at the local gateway.

Comment and review notifications use GitHub's comment/review events. For same-repo PRs they should notify normally; for fork-origin PRs, GitHub secret restrictions can still prevent those event-specific notifications.
