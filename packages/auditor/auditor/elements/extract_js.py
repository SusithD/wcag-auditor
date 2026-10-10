from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

EXTRACT_JS = Path(__file__).with_name("extract.js").read_text(encoding="utf-8")
ELEMENTS_FILE = "elements.json"


EXTRACT_SHA256 = hashlib.sha256(EXTRACT_JS.encode("utf-8")).hexdigest()


def write_elements(
    folder: Path,
    elements: list[dict[str, Any]],
    captured_at: str,
    viewport: dict[str, Any],
    doc_size: dict[str, Any],
) -> None:
    payload = {
        "geometry_source": "capture",
        "captured_at": captured_at,
        "extract_sha256": EXTRACT_SHA256,
        "viewport": viewport,
        "doc_size": doc_size,
        "frame": "document CSS px (getBoundingClientRect + scroll at capture, scroll 0)",
        "elements": elements,
    }
    (folder / ELEMENTS_FILE).write_text(json.dumps(payload, indent=1), encoding="utf-8")
