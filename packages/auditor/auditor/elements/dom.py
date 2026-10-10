from __future__ import annotations

import json
from typing import Any, Literal

from auditor.capture.snapshot import snapshot_html
from auditor.elements.base import Element
from auditor.elements.extract_js import ELEMENTS_FILE, EXTRACT_JS
from auditor.schema import Capture

GeometrySource = Literal["capture", "rerender", "unavailable"]


class GeometryUnavailable(RuntimeError):
    pass


def geometry_source(capture: Capture) -> GeometrySource:
    """capture: measured on the live page; rerender: self-contained page, laid out again
    offline; unavailable: benchmark real page with no stored geometry (ADR-012)."""
    if (capture.path / ELEMENTS_FILE).is_file():
        return "capture"
    if capture.meta.get("origin") == "synth":
        return "rerender"
    return "unavailable"


class DomElementSource:
    """Element boxes in document CSS px.

    Uses `elements.json` (measured at capture time) when present. Self-contained pages
    (synthetic corpus) are re-rendered offline from dom.html with the network blocked so the
    result is reproducible. Benchmark real pages with no stored geometry raise
    GeometryUnavailable: re-rendering them loses external CSS (ADR-012).
    """

    def __init__(self, force_rerender: bool = False, timeout_ms: int = 20000) -> None:
        self.force_rerender = force_rerender
        self.timeout_ms = timeout_ms

    def geometry_source(self, capture: Capture) -> GeometrySource:
        return "rerender" if self.force_rerender else geometry_source(capture)

    def elements(self, capture: Capture) -> list[Element]:
        source = self.geometry_source(capture)
        if source == "unavailable":
            raise GeometryUnavailable(f"{capture.path.name}: no elements.json (see ADR-012)")
        raw = self._load_stored(capture) if source == "capture" else self._rerender(capture)
        return [Element.model_validate(r) for r in raw]

    def dump(self, capture: Capture) -> tuple[dict[str, Any], list[Element] | None]:
        source = self.geometry_source(capture)
        elements = None if source == "unavailable" else self.elements(capture)
        dumped = {
            "geometry_source": source,
            "elements": None if elements is None else [e.model_dump(mode="json") for e in elements],
        }
        return dumped, elements

    def _load_stored(self, capture: Capture) -> list[dict[str, Any]]:
        path = capture.path / ELEMENTS_FILE
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if payload["geometry_source"] != "capture":
                raise ValueError(f"unexpected geometry_source {payload['geometry_source']!r}")
            stored: list[dict[str, Any]] = payload["elements"]
        except (OSError, ValueError, KeyError, TypeError) as exc:
            raise GeometryUnavailable(f"{path}: unreadable ({exc})") from exc
        return stored

    def _rerender(self, capture: Capture) -> list[dict[str, Any]]:
        from playwright.sync_api import sync_playwright

        html = snapshot_html(capture.path, capture.meta)
        spec = capture.viewport_spec
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            try:
                ctx = browser.new_context(
                    viewport={"width": spec.width, "height": spec.height},
                    device_scale_factor=1,
                    is_mobile=spec.is_mobile,
                    has_touch=spec.has_touch,
                )
                ctx.route("**/*", lambda route: route.abort())
                page = ctx.new_page()
                page.set_content(html, wait_until="load", timeout=self.timeout_ms)
                raw: list[dict[str, Any]] = page.evaluate(EXTRACT_JS)
            finally:
                browser.close()
        return raw
