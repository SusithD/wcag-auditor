from __future__ import annotations

from pathlib import Path

from auditor.capture.snapshot import snapshot_html
from auditor.elements.base import Element
from auditor.schema import Capture

EXTRACT_JS = Path(__file__).with_name("extract.js").read_text(encoding="utf-8")


class DomElementSource:
    """Elements from the capture's dom.html, laid out in a fresh Chromium page.

    Network is blocked by default so results are reproducible; pages whose CSS is external
    therefore lay out unstyled. Pass allow_network=True to fetch live styles via <base href>.
    """

    def __init__(self, allow_network: bool = False, timeout_ms: int = 20000) -> None:
        self.allow_network = allow_network
        self.timeout_ms = timeout_ms

    def elements(self, capture: Capture) -> list[Element]:
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
                if not self.allow_network:
                    ctx.route("**/*", lambda route: route.abort())
                page = ctx.new_page()
                page.set_content(html, wait_until="load", timeout=self.timeout_ms)
                raw = page.evaluate(EXTRACT_JS)
            finally:
                browser.close()
        return [Element.model_validate(r) for r in raw]
