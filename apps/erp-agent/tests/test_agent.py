from __future__ import annotations

import tempfile
from pathlib import Path
import unittest

from researchcrafters_erp_agent.config import AgentConfig
from researchcrafters_erp_agent.inputs import infer_slug, resolve_paper_input
from researchcrafters_erp_agent.workflow import build_plan, create_draft, resume_draft


REPO_ROOT = Path(__file__).resolve().parents[3]


class AgentInputTests(unittest.TestCase):
    def test_resolves_arxiv_id(self) -> None:
        paper_input = resolve_paper_input("1706.03762")
        self.assertEqual(paper_input.kind, "arxiv_id")
        self.assertEqual(paper_input.normalized, "https://arxiv.org/abs/1706.03762")
        self.assertEqual(infer_slug(paper_input), "arxiv-1706-03762")

    def test_resolves_direct_pdf_url(self) -> None:
        paper_input = resolve_paper_input("https://example.com/papers/model.pdf")
        self.assertEqual(paper_input.kind, "pdf_url")
        self.assertEqual(infer_slug(paper_input), "model")

    def test_resolves_local_pdf_hash(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            pdf = Path(tmp) / "Paper Draft.pdf"
            pdf.write_bytes(b"%PDF-1.4\n")
            paper_input = resolve_paper_input(str(pdf))
        self.assertEqual(paper_input.kind, "local_pdf")
        self.assertEqual(infer_slug(paper_input), "paper-draft")


class AgentWorkflowTests(unittest.TestCase):
    def test_plan_is_side_effect_free(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self._config(Path(tmp))
            plan = build_plan(
                raw_input="1706.03762",
                slug="attention-draft",
                seed_links=["https://github.com/example/repo"],
                config=config,
            )
            self.assertEqual(plan["package"]["status"], "alpha")
            self.assertFalse(config.run_root.exists())
            self.assertFalse((config.package_root / "attention-draft").exists())

    def test_create_and_resume_are_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self._config(Path(tmp))
            result = create_draft(
                raw_input="1706.03762",
                slug="attention-draft",
                seed_links=[],
                config=config,
                run_id="test-run",
                skip_validate=False,
            )

            package_path = config.package_root / "attention-draft"
            self.assertTrue(package_path.is_dir())
            self.assertTrue((package_path / "package.yaml").is_file())
            self.assertTrue((result["run_dir"] / "manifest.json").is_file())
            self.assertTrue(result["manifest"]["validation_reports"][0]["ok"])

            resumed = resume_draft(run_id="test-run", config=config, skip_validate=True)
            self.assertEqual(resumed["manifest"]["run_id"], "test-run")
            self.assertEqual(len(resumed["manifest"]["validation_reports"]), 1)

    def _config(self, tmp: Path) -> AgentConfig:
        return AgentConfig(
            repo_root=REPO_ROOT,
            run_root=tmp / ".researchcrafters" / "erp-agent" / "runs",
            cache_root=tmp / ".researchcrafters" / "erp-agent" / "cache",
            package_root=tmp / "content" / "packages",
            template_path=REPO_ROOT / "content" / "templates" / "erp-basic",
            validation_command=(
                "python3",
                "-c",
                "import json; print(json.dumps({'ok': True, 'errors': [], 'warnings': [], 'info': []}))",
            ),
            model_provider="disabled",
            search_provider="disabled",
            max_source_count=12,
            max_repair_iterations=3,
        )


if __name__ == "__main__":
    unittest.main()
