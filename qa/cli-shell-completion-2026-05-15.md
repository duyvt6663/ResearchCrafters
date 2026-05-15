# QA — `researchcrafters completion` (bash, zsh, fish)

Backlog item: `[backlog/03-cli-runner.md:36] Shell completion for bash, zsh, and fish.`
Workflow id: `366c39fc-eb19-4215-bfa4-0ba412dae0af`
Branch: `skynet/pr/ci-fixture-hash-assertion-2026-05-15`
Date: 2026-05-15

## Scope

Add a new `researchcrafters completion <shell>` subcommand that prints a shell
completion script for one of `bash`, `zsh`, `fish`. The script lists every
subcommand registered on the root Commander program (so it stays in sync with
the actual command surface) plus per-subcommand options and a fallback to file
completion for positional arguments.

## Changes

- `packages/cli/src/commands/completion.ts` (new) — pure renderer + command
  entry point. Public API: `completionCommand`, `renderCompletion`,
  `isSupportedShell`, `SupportedShell`. Reads `program.commands` so the
  completion stays in lock-step with whatever the CLI actually exposes.
- `packages/cli/src/index.ts` — register `completion <shell>` and wire it to
  `completionCommand(program, shell)`.
- `packages/cli/test/completion.test.ts` (new) — unit tests for shell
  detection, per-shell rendering, and unsupported-shell exit code.

## Verification

1. Typecheck — `pnpm --filter @researchcrafters/cli typecheck` → clean.
2. Focused tests — `pnpm --filter @researchcrafters/cli test -- completion` →
   5/5 passing.
3. Full package suite — `pnpm --filter @researchcrafters/cli test` → 48/48
   passing (six test files).
4. Build + manual smoke — `pnpm --filter @researchcrafters/cli build` then
   - `node bin/researchcrafters.js completion bash` prints a valid bash
     completion script (verified with `bash -n` — no syntax errors).
   - `node bin/researchcrafters.js completion zsh` prints a `#compdef`
     completion script (verified with `zsh -n` — no syntax errors).
   - `node bin/researchcrafters.js completion fish` prints a fish completion
     script. `fish` is not installed on this host, so syntax was not parsed,
     but the output uses only documented `complete -c` / `__fish_use_subcommand`
     / `__fish_seen_subcommand_from` primitives that match the fish docs.
   - `node bin/researchcrafters.js completion powershell` prints
     `Unsupported shell: powershell. Supported: bash, zsh, fish.` to stderr and
     exits with code 1.

## Install hints (also embedded as comments in the scripts)

- bash: `source <(researchcrafters completion bash)` (e.g. in `~/.bashrc`).
- zsh:  `researchcrafters completion zsh > "${fpath[1]}/_researchcrafters"`
        and run `compinit`, or `source <(researchcrafters completion zsh)`.
- fish: `researchcrafters completion fish > ~/.config/fish/completions/researchcrafters.fish`.

## Limitations / follow-ups

- Completion is one-shot static text generated at invocation time; it does not
  call back into the CLI for dynamic argument values (e.g. listing package
  paths from the API). That is intentional — the backlog item asks for shell
  completion, not entitlement-aware suggestions.
- Positional arguments fall back to file completion, which is the right thing
  for `validate/preview/build/start <packagePath>` and a harmless default for
  `logs <runId>`.
