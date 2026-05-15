from __future__ import annotations

from datetime import datetime, timezone
import json
import sys
from typing import Any


class JsonLogger:
    def __init__(self, quiet: bool = False) -> None:
        self.quiet = quiet

    def event(
        self,
        event: str,
        *,
        run_id: str | None = None,
        graph_node: str | None = None,
        package_slug: str | None = None,
        package_path: str | None = None,
        **fields: Any,
    ) -> None:
        if self.quiet:
            return
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "event": event,
            "run_id": run_id,
            "graph_node": graph_node,
            "package_slug": package_slug,
            "package_path": package_path,
        }
        payload.update(fields)
        sys.stderr.write(json.dumps(payload, sort_keys=True) + "\n")
