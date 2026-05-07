#!/usr/bin/env python3
"""Block destructive Bash commands during agent tool calls.

Triggered by PreToolUse(matcher='Bash'). Reads the tool input from stdin,
inspects the `command` field, and exits 2 (blocking) when it matches a
destructive pattern.

Background — why this exists:
In a prior session, parallel agents shared the same git working directory.
At least one agent ran `git reset --hard HEAD` mid-task to "get back to a
clean state" — which wiped 30+ files of sibling-agent work. The reflog
showed six `reset: moving to HEAD` entries back-to-back. Recovery via
`git fsck --unreachable --no-reflogs` and dangling blobs took an hour.

This hook is the floor. Agents should never reach for these ops to recover
from confusion; they should ask the user first.
"""
import json
import re
import sys

try:
    payload = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)

cmd = payload.get("tool_input", {}).get("command", "")
if not cmd:
    sys.exit(0)

# (regex, human-readable label, hint)
PATTERNS = [
    (r"\bgit\s+reset\s+(--hard|--keep)\b",
     "git reset --hard / --keep",
     "Use `git stash` or commit your work; never reset away other agents' files."),
    (r"\bgit\s+checkout\s+(--\s+)?\.\s*$",
     "git checkout .",
     "Discards all working-tree changes — including changes you didn't make."),
    (r"\bgit\s+restore\s+(--source\s+\S+\s+)?\.\s*$",
     "git restore .",
     "Same blast radius as `git checkout .`."),
    (r"\bgit\s+clean\s+-[a-zA-Z]*[fF]",
     "git clean -f",
     "Deletes untracked files irreversibly."),
    (r"\bgit\s+stash\s+(drop|clear)\b",
     "git stash drop / clear",
     "Loses stashed work; ask before doing this."),
    (r"\bgit\s+push\s+--force(?!\-with\-lease)\b",
     "git push --force (without --force-with-lease)",
     "Use --force-with-lease if you must, after explicit user OK."),
    (r"\bgit\s+update-ref\s+-d\b",
     "git update-ref -d",
     "Direct ref deletion. Don't."),
    (r"\bgit\s+reflog\s+(delete|expire)\b",
     "git reflog delete / expire",
     "Reflog is the recovery surface for resets. Don't shorten it."),
    (r"\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*[fF]?\s+(/\s|/$|\.\s*$|\*|~|\$HOME|\$\{HOME)",
     "rm -rf on a dangerous target (/, ., *, ~, $HOME)",
     "Specify a precise subdirectory; never sweep the project or home."),
    (r"\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*[fF]?\s+\$\{?CLAUDE_PROJECT_DIR\}?",
     "rm -rf $CLAUDE_PROJECT_DIR",
     "Deletes the entire project."),
    (r"\bsudo\s+rm\b",
     "sudo rm",
     "Privileged delete. Don't."),
    (r":\(\)\s*\{[^}]*:\|:[^}]*\};:",
     "fork bomb",
     "..."),
    (r"\bdd\s+if=.*of=/dev/(sd|nvme|hd|disk)",
     "dd to raw block device",
     "Don't write to raw disks."),
    (r"\bmkfs\.",
     "mkfs",
     "Don't format filesystems."),
    (r">\s*/dev/(sd|nvme|hd|disk)",
     "redirect to raw block device",
     "Don't write to raw disks."),
]

for pattern, label, hint in PATTERNS:
    if re.search(pattern, cmd):
        sys.stderr.write(
            f"\n[blocked by .claude/hooks/block-dangerous-commands.py]\n\n"
            f"Forbidden operation: {label}\n"
            f"Hint: {hint}\n\n"
            f"Why this hook exists:\n"
            f"  In a prior session an agent ran `git reset --hard HEAD` to clean its\n"
            f"  working tree mid-task and wiped 30+ files of sibling-agent work. The\n"
            f"  reflog still shows six back-to-back `reset: moving to HEAD` entries.\n"
            f"  Recovery via `git fsck --unreachable` took an hour. We do not allow\n"
            f"  destructive ops without explicit user authorisation.\n\n"
            f"Command that was blocked:\n  {cmd}\n\n"
            f"If you genuinely need this:\n"
            f"  1. Ask the user in your reply, naming the exact command and reason.\n"
            f"  2. Wait for explicit approval.\n"
            f"  3. The user can override per-call by running the command in `!` prefix\n"
            f"     mode themselves, or by temporarily disabling the hook.\n"
        )
        sys.exit(2)

sys.exit(0)
