from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import shlex
import tomllib
from typing import Any


DEFAULT_VALIDATION_COMMAND = (
    "node",
    "packages/cli/bin/researchcrafters.js",
    "validate",
    "{package_path}",
    "--json",
)


@dataclass(frozen=True)
class AgentConfig:
    repo_root: Path
    run_root: Path
    cache_root: Path
    package_root: Path
    template_path: Path
    validation_command: tuple[str, ...]
    model_provider: str
    search_provider: str
    max_source_count: int
    max_repair_iterations: int

    def to_manifest(self) -> dict[str, Any]:
        return {
            "repo_root": str(self.repo_root),
            "run_root": str(self.run_root),
            "cache_root": str(self.cache_root),
            "package_root": str(self.package_root),
            "template_path": str(self.template_path),
            "validation_command": list(self.validation_command),
            "model_provider": self.model_provider,
            "search_provider": self.search_provider,
            "max_source_count": self.max_source_count,
            "max_repair_iterations": self.max_repair_iterations,
            "execution_mode": "local_only",
        }


def find_repo_root(start: Path | None = None) -> Path:
    cursor = (start or Path.cwd()).resolve()
    for candidate in (cursor, *cursor.parents):
        if (candidate / "pnpm-workspace.yaml").is_file() and (
            candidate / "content" / "templates" / "erp-basic"
        ).is_dir():
            return candidate
    raise FileNotFoundError(
        "Could not find the ResearchCrafters repo root from "
        f"{cursor}. Pass --repo-root explicitly."
    )


def load_config(config_path: Path | None = None, repo_root: Path | None = None) -> AgentConfig:
    root = (repo_root or find_repo_root()).resolve()
    data: dict[str, Any] = {}
    if config_path is not None:
        with config_path.expanduser().resolve().open("rb") as fh:
            data = tomllib.load(fh)

    providers = data.get("providers", {})
    paths = data.get("paths", {})
    limits = data.get("limits", {})

    model_provider = os.getenv("ERP_AGENT_MODEL_PROVIDER", providers.get("model", "disabled"))
    search_provider = os.getenv("ERP_AGENT_SEARCH_PROVIDER", providers.get("search", "disabled"))

    run_root = _path_from_value(
        root,
        os.getenv("ERP_AGENT_RUN_ROOT", paths.get("run_root", ".researchcrafters/erp-agent/runs")),
    )
    cache_root = _path_from_value(
        root,
        os.getenv("ERP_AGENT_CACHE_ROOT", paths.get("cache_root", ".researchcrafters/erp-agent/cache")),
    )
    package_root = _path_from_value(
        root,
        os.getenv("ERP_AGENT_PACKAGE_ROOT", paths.get("package_root", "content/packages")),
    )
    template_path = _path_from_value(
        root,
        os.getenv("ERP_AGENT_TEMPLATE_PATH", paths.get("template_path", "content/templates/erp-basic")),
    )

    validation_command = _command_from_value(
        os.getenv("ERP_AGENT_VALIDATION_COMMAND", None),
        paths.get("validation_command", DEFAULT_VALIDATION_COMMAND),
    )

    return AgentConfig(
        repo_root=root,
        run_root=run_root,
        cache_root=cache_root,
        package_root=package_root,
        template_path=template_path,
        validation_command=validation_command,
        model_provider=str(model_provider),
        search_provider=str(search_provider),
        max_source_count=_int_from_value(
            os.getenv("ERP_AGENT_MAX_SOURCE_COUNT", limits.get("max_source_count", 12)),
            "max_source_count",
        ),
        max_repair_iterations=_int_from_value(
            os.getenv("ERP_AGENT_MAX_REPAIR_ITERATIONS", limits.get("max_repair_iterations", 3)),
            "max_repair_iterations",
        ),
    )


def with_path_overrides(
    config: AgentConfig,
    *,
    run_root: Path | None = None,
    package_root: Path | None = None,
    template_path: Path | None = None,
    validation_command: str | None = None,
) -> AgentConfig:
    return AgentConfig(
        repo_root=config.repo_root,
        run_root=_path_from_value(config.repo_root, run_root) if run_root else config.run_root,
        cache_root=config.cache_root,
        package_root=_path_from_value(config.repo_root, package_root)
        if package_root
        else config.package_root,
        template_path=_path_from_value(config.repo_root, template_path)
        if template_path
        else config.template_path,
        validation_command=_command_from_value(validation_command, config.validation_command)
        if validation_command
        else config.validation_command,
        model_provider=config.model_provider,
        search_provider=config.search_provider,
        max_source_count=config.max_source_count,
        max_repair_iterations=config.max_repair_iterations,
    )


def _path_from_value(root: Path, value: str | Path) -> Path:
    path = value if isinstance(value, Path) else Path(str(value))
    if path.is_absolute():
        return path.resolve()
    return (root / path).resolve()


def _command_from_value(env_value: str | None, value: Any) -> tuple[str, ...]:
    if env_value:
        parsed = tuple(shlex.split(env_value))
    elif isinstance(value, str):
        parsed = tuple(shlex.split(value))
    else:
        parsed = tuple(str(part) for part in value)
    if not parsed:
        raise ValueError("validation_command cannot be empty")
    return parsed


def _int_from_value(value: Any, name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if parsed < 0:
        raise ValueError(f"{name} must be non-negative")
    return parsed
