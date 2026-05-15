from __future__ import annotations

from pathlib import Path
from typing import Any


def write_agent_report(run_dir: Path, manifest: dict[str, Any]) -> Path:
    report_path = run_dir / "agent-report.md"
    package = manifest["package"]
    validation_reports = manifest.get("validation_reports", [])
    latest_validation = validation_reports[-1] if validation_reports else None
    validation_status = "skipped"
    if latest_validation:
        validation_status = "passed" if latest_validation.get("ok") else "failed"

    report_path.write_text(
        "\n".join(
            [
                "# ERP Agent Report",
                "",
                f"- Run ID: `{manifest['run_id']}`",
                f"- Input: `{manifest['input']['normalized']}`",
                f"- Input kind: `{manifest['input']['kind']}`",
                f"- Package: `{package['slug']}`",
                f"- Package path: `{package['path']}`",
                f"- Generated status: `{package['status']}`",
                f"- Validation: `{validation_status}`",
                "",
                "## Generated Files",
                "",
                *[f"- `{item}`" for item in manifest.get("generated_files", [])],
                "",
                "## Review Blockers",
                "",
                "- Replace template placeholders with source-grounded paper metadata and ARA content.",
                "- Verify every source-supported claim has evidence or source refs.",
                "- Keep package status at `alpha` until human expert release approval.",
                "- Confirm generated excerpts summarize or cite sources without copying large passages.",
                "",
                "## Reviewer Checklist",
                "",
                "- Run `researchcrafters validate <package-path> --json`.",
                "- Review branch fairness and support levels.",
                "- Review mentor redaction targets and leak-test prompts.",
                "- Review starter, tests, fixtures, and canonical solution coherence.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    return report_path
