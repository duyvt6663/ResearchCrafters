# Telegram Notifications

This repo has `.github/workflows/telegram-notify.yml` for sending GitHub activity to a Telegram channel.

It currently notifies on:

- completed `CI` workflow runs, including pull request failures
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
5. In GitHub Actions, run `Telegram Notifications` manually from the Actions tab to verify the channel receives a test message.

## Adding CD Workflows

The workflow watches completed runs of workflows named `CI`. If this repo later adds deployment workflows, add their exact workflow names here:

```yaml
on:
  workflow_run:
    workflows: ['CI', 'Deploy']
    types: [completed]
```

Keep this notification workflow separate from CI/CD jobs. It does not check out or execute pull request code, so it can safely send notifications after CI runs complete.
