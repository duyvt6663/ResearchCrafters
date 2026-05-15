from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
from urllib.parse import urlparse


ARXIV_ID_RE = re.compile(r"^(?:[a-z-]+(?:\.[A-Z]{2})?/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


@dataclass(frozen=True)
class PaperInput:
    raw: str
    kind: str
    normalized: str
    source_hash: str
    local_pdf_path: str | None
    arxiv_id: str | None
    seed_links: tuple[str, ...]

    def to_manifest(self) -> dict[str, object]:
        return {
            "raw": self.raw,
            "kind": self.kind,
            "normalized": self.normalized,
            "source_hash": self.source_hash,
            "local_pdf_path": self.local_pdf_path,
            "arxiv_id": self.arxiv_id,
            "seed_links": list(self.seed_links),
        }


def resolve_paper_input(raw: str, seed_links: list[str] | tuple[str, ...] = ()) -> PaperInput:
    value = raw.strip()
    if not value:
        raise ValueError("--input cannot be empty")

    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        arxiv_id = _arxiv_id_from_url(parsed.netloc, parsed.path)
        if arxiv_id:
            normalized = f"https://arxiv.org/abs/{arxiv_id}"
            return PaperInput(
                raw=value,
                kind="arxiv_id",
                normalized=normalized,
                source_hash=_sha256_text(normalized),
                local_pdf_path=None,
                arxiv_id=arxiv_id,
                seed_links=tuple(seed_links),
            )
        kind = "pdf_url" if parsed.path.lower().endswith(".pdf") else "paper_url"
        return PaperInput(
            raw=value,
            kind=kind,
            normalized=value,
            source_hash=_sha256_text(value),
            local_pdf_path=None,
            arxiv_id=None,
            seed_links=tuple(seed_links),
        )

    if ARXIV_ID_RE.match(value):
        normalized = f"https://arxiv.org/abs/{value}"
        return PaperInput(
            raw=value,
            kind="arxiv_id",
            normalized=normalized,
            source_hash=_sha256_text(normalized),
            local_pdf_path=None,
            arxiv_id=value,
            seed_links=tuple(seed_links),
        )

    candidate = Path(value).expanduser()
    if candidate.is_file() and candidate.suffix.lower() == ".pdf":
        resolved = candidate.resolve()
        return PaperInput(
            raw=value,
            kind="local_pdf",
            normalized=str(resolved),
            source_hash=_sha256_file(resolved),
            local_pdf_path=str(resolved),
            arxiv_id=None,
            seed_links=tuple(seed_links),
        )

    if value.lower().endswith(".pdf"):
        raise FileNotFoundError(f"Local PDF path does not exist: {value}")

    raise ValueError(
        "Unsupported input. Use an arXiv id, arXiv URL, paper URL, direct PDF URL, or local PDF path."
    )


def infer_slug(paper_input: PaperInput, explicit_slug: str | None = None) -> str:
    if explicit_slug:
        return validate_slug(explicit_slug)
    if paper_input.arxiv_id:
        return validate_slug("arxiv-" + paper_input.arxiv_id.replace("/", "-").replace(".", "-"))
    if paper_input.kind == "local_pdf" and paper_input.local_pdf_path:
        return validate_slug(slugify(Path(paper_input.local_pdf_path).stem))
    parsed = urlparse(paper_input.normalized)
    path_part = Path(parsed.path).stem or parsed.netloc
    return validate_slug(slugify(path_part or "draft-erp"))


def validate_slug(slug: str) -> str:
    normalized = slugify(slug)
    if not normalized or not SLUG_RE.match(normalized):
        raise ValueError(
            "Slug must contain lowercase letters, numbers, and hyphens, "
            "and must start with a letter or number."
        )
    return normalized


def slugify(value: str) -> str:
    lowered = value.strip().lower()
    replaced = re.sub(r"[^a-z0-9]+", "-", lowered)
    return re.sub(r"-+", "-", replaced).strip("-")


def title_from_slug(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("-") if part) or "Draft ERP"


def _arxiv_id_from_url(netloc: str, path: str) -> str | None:
    if netloc.lower() not in {"arxiv.org", "www.arxiv.org"}:
        return None
    parts = [part for part in path.split("/") if part]
    if len(parts) < 2 or parts[0] not in {"abs", "pdf"}:
        return None
    arxiv_id = parts[1]
    if arxiv_id.endswith(".pdf"):
        arxiv_id = arxiv_id[:-4]
    return arxiv_id if ARXIV_ID_RE.match(arxiv_id) else None


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
