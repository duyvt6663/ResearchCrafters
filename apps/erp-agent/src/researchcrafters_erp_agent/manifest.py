from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from .config import AgentConfig
from .inputs import PaperInput


WORKFLOW_NODES = [
    "resolve_input",
    "download_paper",
    "parse_paper",
    "gather_learning_materials",
    "extract_ara",
    "reconstruct_branches",
    "plan_curriculum",
    "human_plan_review",
    "generate_happy_path_package",
    "validate_package",
    "repair_loop",
    "expand_modules_and_branches",
    "run_quality_agents",
    "tailor_learning_experience",
    "final_validation",
    "human_release_review",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_run_id(source_hash: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stamp}-{source_hash[:10]}"


def initial_manifest(
    *,
    run_id: str,
    paper_input: PaperInput,
    slug: str,
    title: str,
    package_path: Path,
    config: AgentConfig,
) -> dict[str, Any]:
    now = utc_now()
    return {
        "schema_version": 1,
        "run_id": run_id,
        "created_at": now,
        "updated_at": now,
        "input": paper_input.to_manifest(),
        "paper_metadata": {
            "title": title,
            "authors": [],
            "year": None,
            "venue": "",
            "arxiv_id": paper_input.arxiv_id,
            "status": "unparsed",
        },
        "package": {
            "slug": slug,
            "title": title,
            "path": str(package_path),
            "status": "alpha",
        },
        "workflow": [
            {
                "node": node,
                "status": "pending",
                "started_at": None,
                "finished_at": None,
                "notes": [],
            }
            for node in WORKFLOW_NODES
        ],
        "config": config.to_manifest(),
        "source_snapshots": [],
        "generated_files": [],
        "validation_reports": [],
        "review_findings": [],
        "decisions": [
            {
                "id": "product-boundary.local-only",
                "decision": "local_only",
                "rationale": "The first implementation writes local run artifacts and package source only.",
            },
            {
                "id": "release-status.default-alpha",
                "decision": "generated packages start as alpha",
                "rationale": "The agent cannot promote packages without explicit human release approval.",
            },
            {
                "id": "cache-location.repo-local",
                "decision": str(config.cache_root),
                "rationale": "Long-running source caches stay repo-local until a worker-backed flow exists.",
            },
            {
                "id": "copyright.excerpts",
                "decision": "summarize_or_cite",
                "rationale": "Generated source excerpts must avoid copying large copyrighted passages.",
            },
        ],
        "side_effects": [],
        "repair_count": 0,
    }


def mark_node(
    manifest: dict[str, Any],
    node: str,
    status: str,
    *,
    note: str | None = None,
) -> None:
    now = utc_now()
    for item in manifest["workflow"]:
        if item["node"] != node:
            continue
        if item["started_at"] is None and status in {"running", "completed", "blocked"}:
            item["started_at"] = now
        if status in {"completed", "blocked", "skipped"}:
            item["finished_at"] = now
        item["status"] = status
        if note:
            item["notes"].append(note)
        manifest["updated_at"] = now
        return
    raise KeyError(f"Unknown workflow node: {node}")


def write_manifest(run_dir: Path, manifest: dict[str, Any]) -> None:
    manifest["updated_at"] = utc_now()
    write_json_atomic(run_dir / "manifest.json", manifest)


def load_manifest(run_dir: Path) -> dict[str, Any]:
    with (run_dir / "manifest.json").open("r", encoding="utf-8") as fh:
        return json.load(fh)


def write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    tmp.replace(path)
