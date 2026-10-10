from __future__ import annotations

import hashlib
import importlib.metadata
import subprocess
from pathlib import Path
from typing import Any

from auditor import protocol

AXE_PATH = Path(__file__).parent / "rules" / "vendor" / "axe.min.js"
MODEL_PATH = Path(__file__).parent / "detector" / "model.onnx"


def _sha256(path: Path) -> str | None:
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None


def _git_sha() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=Path(__file__).parent,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    return out.stdout.strip() or None


def collect(capture_meta: dict[str, Any] | None = None) -> dict[str, str | None]:
    tools = (capture_meta or {}).get("tools", {})
    return {
        "chromium": tools.get("browser"),
        "playwright": importlib.metadata.version("playwright"),
        "axe": _sha256(AXE_PATH),
        "model_sha": _sha256(MODEL_PATH),
        "protocol_sha": protocol.sha256(),
        "git_sha": _git_sha(),
    }
