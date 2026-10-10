from __future__ import annotations

import json
from typing import Any, Literal

from auditor.capture.snapshot import snapshot_html
from auditor.elements.base import Element
from auditor.elements.extract_js import ELEMENTS_FILE, EXTRACT_JS, extract_args
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
        self._cm: Any = None
        self._browser: Any = None
        self._shared = False

    def __enter__(self) -> DomElementSource:
        self._shared = True
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _ensure_browser(self) -> Any:
        if self._browser is None:
            from playwright.sync_api import sync_playwright

            self._cm = sync_playwright()
            pw = self._cm.__enter__()
            try:
                self._browser = pw.chromium.launch(headless=True)
            except Exception:
                self._cm.__exit__(None, None, None)
                self._cm = None
                raise
        return self._browser

    def close(self) -> None:
        self._shared = False
        try:
            if self._browser is not None:
                self._browser.close()
        finally:
            if self._cm is not None:
                self._cm.__exit__(None, None, None)
            self._browser, self._cm = None, None

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
        if self._shared:
            return self._rerender_in(self._ensure_browser(), capture)
        try:
            return self._rerender_in(self._ensure_browser(), capture)
        finally:
            self.close()

    def _rerender_in(self, browser: Any, capture: Capture) -> list[dict[str, Any]]:
        html = snapshot_html(capture.path, capture.meta)
        spec = capture.viewport_spec
        ctx = browser.new_context(
            viewport={"width": spec.width, "height": spec.height},
            device_scale_factor=1,
            is_mobile=spec.is_mobile,
            has_touch=spec.has_touch,
        )
        try:
            ctx.route("**/*", lambda route: route.abort())
            page = ctx.new_page()
            page.set_content(html, wait_until="load", timeout=self.timeout_ms)
            raw: list[dict[str, Any]] = page.evaluate(EXTRACT_JS, extract_args())
        finally:
            ctx.close()
        return raw
