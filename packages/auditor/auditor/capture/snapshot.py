from __future__ import annotations

import re
from html import escape
from pathlib import Path
from typing import Any

_SCRIPT = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.S | re.I)
_BASE = re.compile(r"<base\b", re.I)
_HEAD = re.compile(r"(<head\b[^>]*>)", re.I)


def snapshot_html(folder: Path, meta: dict[str, Any]) -> str:
    html = (folder / "dom.html").read_text(encoding="utf-8", errors="replace")
    html = _SCRIPT.sub("", html)
    base = meta.get("final_url") or meta.get("url") or ""
    if base.startswith("http") and not _BASE.search(html):
        tag = f'<base href="{escape(base, quote=True)}">'
        if _HEAD.search(html):
            html = _HEAD.sub(lambda m: m.group(1) + tag, html, count=1)
        else:
            html = tag + html
    return html
