from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from .config import load_config, with_path_overrides
from .logging import JsonLogger
from .workflow import build_plan, create_draft, resume_draft


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        config = _config_from_args(args)
        logger = JsonLogger(quiet=args.quiet)
        if args.command == "plan":
            plan = build_plan(
                raw_input=args.input,
                slug=args.slug,
                seed_links=args.seed_link,
                config=config,
            )
            _print_payload(plan, json_output=args.json)
            return 0
        if args.command == "create":
            result = create_draft(
                raw_input=args.input,
                slug=args.slug,
                seed_links=args.seed_link,
                config=config,
                run_id=args.run_id,
                skip_validate=args.skip_validate,
                logger=logger,
            )
            _print_result(result, json_output=args.json)
            return 0
        if args.command == "resume":
            result = resume_draft(
                run_id=args.run_id,
                config=config,
                skip_validate=args.skip_validate,
                logger=logger,
            )
            _print_result(result, json_output=args.json)
            return 0
        parser.print_help(sys.stderr)
        return 2
    except Exception as exc:  # noqa: BLE001 - CLI boundary.
        sys.stderr.write(f"erp-agent: error: {exc}\n")
        return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="erp-agent",
        description="Local paper-to-ERP authoring accelerator.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--config", type=Path, help="Optional TOML config file.")
    common.add_argument("--repo-root", type=Path, help="ResearchCrafters repo root.")
    common.add_argument("--run-root", type=Path, help="Override run folder root.")
    common.add_argument("--package-root", type=Path, help="Override content package root.")
    common.add_argument("--template-path", type=Path, help="Override ERP template path.")
    common.add_argument("--validation-command", help="Override validation command.")
    common.add_argument("--quiet", action="store_true", help="Suppress JSONL progress logs.")
    common.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")

    plan = subparsers.add_parser("plan", parents=[common], help="Dry-run a package plan.")
    plan.add_argument("--input", required=True, help="arXiv id, URL, PDF URL, or local PDF path.")
    plan.add_argument("--slug", help="Package slug. Defaults to an inferred slug.")
    plan.add_argument("--seed-link", action="append", default=[], help="Official code/project seed URL.")

    create = subparsers.add_parser("create", parents=[common], help="Create a draft package and run folder.")
    create.add_argument("--input", required=True, help="arXiv id, URL, PDF URL, or local PDF path.")
    create.add_argument("--slug", required=True, help="Package slug to create under content/packages/.")
    create.add_argument("--seed-link", action="append", default=[], help="Official code/project seed URL.")
    create.add_argument("--run-id", help="Optional deterministic run id for controlled reruns.")
    create.add_argument("--skip-validate", action="store_true", help="Do not run ResearchCrafters validation.")

    resume = subparsers.add_parser("resume", parents=[common], help="Resume an existing run id.")
    resume.add_argument("--run-id", required=True, help="Run id under the configured run root.")
    resume.add_argument("--skip-validate", action="store_true", help="Do not run ResearchCrafters validation.")

    return parser


def _config_from_args(args: argparse.Namespace):
    config = load_config(args.config, args.repo_root)
    return with_path_overrides(
        config,
        run_root=args.run_root,
        package_root=args.package_root,
        template_path=args.template_path,
        validation_command=args.validation_command,
    )


def _print_result(result: dict[str, Any], *, json_output: bool) -> None:
    manifest = result["manifest"]
    payload = {
        "run_id": manifest["run_id"],
        "run_dir": str(result["run_dir"]),
        "package": manifest["package"],
        "agent_report": str(result["agent_report"]),
        "validation_reports": manifest.get("validation_reports", []),
    }
    _print_payload(payload, json_output=json_output)


def _print_payload(payload: dict[str, Any], *, json_output: bool) -> None:
    if json_output:
        sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")
        return
    if "run_id" in payload:
        sys.stdout.write(
            "\n".join(
                [
                    f"Run: {payload['run_id']}",
                    f"Package: {payload['package']['path']}",
                    f"Report: {payload['agent_report']}",
                    "",
                ]
            )
        )
        return
    sys.stdout.write(json.dumps(payload, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
