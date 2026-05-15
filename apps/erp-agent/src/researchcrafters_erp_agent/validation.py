from __future__ import annotations

import json
from pathlib import Path
import subprocess
from typing import Any

from .config import AgentConfig


def run_validation(package_path: Path, config: AgentConfig) -> dict[str, Any]:
    command = _build_validation_command(package_path, config)
    try:
        completed = subprocess.run(
            command,
            cwd=config.repo_root,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as exc:
        return {
            "command": command,
            "exit_code": 127,
            "ok": False,
            "stdout": "",
            "stderr": str(exc),
            "report": None,
        }

    report = _parse_json_report(completed.stdout)
    return {
        "command": command,
        "exit_code": completed.returncode,
        "ok": bool(report.get("ok")) if isinstance(report, dict) else completed.returncode == 0,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
        "report": report,
    }


def _build_validation_command(package_path: Path, config: AgentConfig) -> list[str]:
    replacements = {
        "{package_path}": str(package_path),
        "{repo_root}": str(config.repo_root),
    }
    command = []
    has_package_placeholder = False
    for part in config.validation_command:
        rendered = part
        for placeholder, value in replacements.items():
            if placeholder in rendered:
                has_package_placeholder = has_package_placeholder or placeholder == "{package_path}"
                rendered = rendered.replace(placeholder, value)
        command.append(rendered)
    if not has_package_placeholder:
        command.extend([str(package_path), "--json"])
    return command


def _parse_json_report(stdout: str) -> dict[str, Any] | None:
    start = stdout.find("{")
    end = stdout.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(stdout[start : end + 1])
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
