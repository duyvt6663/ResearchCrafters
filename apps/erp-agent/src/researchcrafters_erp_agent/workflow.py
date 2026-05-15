from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import AgentConfig
from .inputs import infer_slug, resolve_paper_input, title_from_slug
from .logging import JsonLogger
from .manifest import (
    WORKFLOW_NODES,
    initial_manifest,
    load_manifest,
    mark_node,
    new_run_id,
    utc_now,
    write_json_atomic,
    write_manifest,
)
from .report import write_agent_report
from .scaffold import copy_template_package
from .validation import run_validation


def build_plan(
    *,
    raw_input: str,
    slug: str | None,
    seed_links: list[str],
    config: AgentConfig,
) -> dict[str, Any]:
    paper_input = resolve_paper_input(raw_input, seed_links)
    package_slug = infer_slug(paper_input, slug)
    title = f"Draft ERP: {title_from_slug(package_slug)}"
    package_path = config.package_root / package_slug
    return {
        "schema_version": 1,
        "input": paper_input.to_manifest(),
        "package": {
            "slug": package_slug,
            "title": title,
            "path": str(package_path),
            "status": "alpha",
        },
        "outputs": {
            "package_path": str(package_path),
            "run_root": str(config.run_root),
            "cache_root": str(config.cache_root),
        },
        "policies": {
            "execution_mode": "local_only",
            "status_floor": "alpha",
            "source_excerpt_policy": "summarize_or_cite",
            "canonical_output": "content_package_filesystem",
        },
        "workflow": [
            {
                "node": node,
                "planned": True,
                "implemented_in_skeleton": node
                in {"resolve_input", "generate_happy_path_package", "validate_package"},
            }
            for node in WORKFLOW_NODES
        ],
        "config": config.to_manifest(),
    }


def create_draft(
    *,
    raw_input: str,
    slug: str,
    seed_links: list[str],
    config: AgentConfig,
    run_id: str | None = None,
    skip_validate: bool = False,
    logger: JsonLogger | None = None,
) -> dict[str, Any]:
    log = logger or JsonLogger(quiet=True)
    paper_input = resolve_paper_input(raw_input, seed_links)
    package_slug = infer_slug(paper_input, slug)
    title = f"Draft ERP: {title_from_slug(package_slug)}"
    resolved_run_id = run_id or new_run_id(paper_input.source_hash)
    run_dir = config.run_root / resolved_run_id
    package_path = config.package_root / package_slug

    if run_dir.exists():
        raise FileExistsError(f"Run already exists: {run_dir}. Use resume instead.")
    if package_path.exists():
        raise FileExistsError(f"Package already exists: {package_path}")

    run_dir.mkdir(parents=True)
    config.cache_root.mkdir(parents=True, exist_ok=True)
    manifest = initial_manifest(
        run_id=resolved_run_id,
        paper_input=paper_input,
        slug=package_slug,
        title=title,
        package_path=package_path,
        config=config,
    )
    write_json_atomic(
        run_dir / "package-plan.json",
        build_plan(
            raw_input=raw_input,
            slug=package_slug,
            seed_links=seed_links,
            config=config,
        ),
    )
    mark_node(manifest, "resolve_input", "completed")
    manifest["side_effects"].append({"kind": "mkdir", "path": str(run_dir), "at": utc_now()})
    write_manifest(run_dir, manifest)
    log.event(
        "resolve_input.completed",
        run_id=resolved_run_id,
        graph_node="resolve_input",
        package_slug=package_slug,
        package_path=str(package_path),
        input_kind=paper_input.kind,
    )

    generated = copy_template_package(
        template_path=config.template_path,
        package_path=package_path,
        slug=package_slug,
        title=title,
    )
    manifest["generated_files"] = generated
    manifest["side_effects"].append(
        {
            "kind": "copy_template",
            "template_path": str(config.template_path),
            "package_path": str(package_path),
            "at": utc_now(),
        }
    )
    mark_node(
        manifest,
        "generate_happy_path_package",
        "completed",
        note="Copied erp-basic scaffold and replaced package-level placeholders.",
    )
    write_manifest(run_dir, manifest)
    log.event(
        "generate_happy_path_package.completed",
        run_id=resolved_run_id,
        graph_node="generate_happy_path_package",
        package_slug=package_slug,
        package_path=str(package_path),
        generated_file_count=len(generated),
    )

    _maybe_validate(
        manifest=manifest,
        run_dir=run_dir,
        config=config,
        package_path=package_path,
        skip_validate=skip_validate,
        logger=log,
    )
    report_path = write_agent_report(run_dir, manifest)
    manifest["side_effects"].append(
        {"kind": "write_report", "path": str(report_path), "at": utc_now()}
    )
    write_manifest(run_dir, manifest)
    return {"run_dir": run_dir, "manifest": manifest, "agent_report": report_path}


def resume_draft(
    *,
    run_id: str,
    config: AgentConfig,
    skip_validate: bool = False,
    logger: JsonLogger | None = None,
) -> dict[str, Any]:
    log = logger or JsonLogger(quiet=True)
    run_dir = config.run_root / run_id
    if not run_dir.is_dir():
        raise FileNotFoundError(f"Run does not exist: {run_dir}")
    manifest = load_manifest(run_dir)
    package = manifest["package"]
    package_path = Path(package["path"])
    package_slug = str(package["slug"])
    title = str(package["title"])

    if not package_path.exists():
        generated = copy_template_package(
            template_path=config.template_path,
            package_path=package_path,
            slug=package_slug,
            title=title,
        )
        manifest["generated_files"] = generated
        manifest["side_effects"].append(
            {
                "kind": "copy_template",
                "template_path": str(config.template_path),
                "package_path": str(package_path),
                "at": utc_now(),
                "resumed": True,
            }
        )
        mark_node(
            manifest,
            "generate_happy_path_package",
            "completed",
            note="Resumed by recreating missing package scaffold.",
        )

    manifest.setdefault("resumes", []).append({"at": utc_now()})
    _maybe_validate(
        manifest=manifest,
        run_dir=run_dir,
        config=config,
        package_path=package_path,
        skip_validate=skip_validate,
        logger=log,
    )
    report_path = write_agent_report(run_dir, manifest)
    write_manifest(run_dir, manifest)
    return {"run_dir": run_dir, "manifest": manifest, "agent_report": report_path}


def _maybe_validate(
    *,
    manifest: dict[str, Any],
    run_dir: Path,
    config: AgentConfig,
    package_path: Path,
    skip_validate: bool,
    logger: JsonLogger,
) -> None:
    package = manifest["package"]
    if skip_validate:
        mark_node(manifest, "validate_package", "skipped", note="Skipped by CLI flag.")
        write_manifest(run_dir, manifest)
        return

    mark_node(manifest, "validate_package", "running")
    write_manifest(run_dir, manifest)
    logger.event(
        "validate_package.started",
        run_id=manifest["run_id"],
        graph_node="validate_package",
        package_slug=package["slug"],
        package_path=str(package_path),
    )
    validation = run_validation(package_path, config)
    report_index = len(manifest.get("validation_reports", [])) + 1
    report_path = run_dir / f"validation-report-{report_index:03d}.json"
    write_json_atomic(report_path, validation)
    manifest.setdefault("validation_reports", []).append(
        {
            "path": str(report_path),
            "ok": validation["ok"],
            "exit_code": validation["exit_code"],
            "command": validation["command"],
            "at": utc_now(),
        }
    )
    mark_node(
        manifest,
        "validate_package",
        "completed" if validation["ok"] else "blocked",
        note=f"Validation report: {report_path}",
    )
    logger.event(
        "validate_package.completed",
        run_id=manifest["run_id"],
        graph_node="validate_package",
        package_slug=package["slug"],
        package_path=str(package_path),
        ok=validation["ok"],
        exit_code=validation["exit_code"],
    )
