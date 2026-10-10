from __future__ import annotations

import contextlib
import json
from pathlib import Path
from typing import Any

from auditor import browser
from auditor.capture.snapshot import snapshot_html
from auditor.rules.rulemap import COVERED_SCS, RULE_TO_SC
from auditor.schema import Capture

AXE_PATH = Path(__file__).with_name("vendor") / "axe.min.js"
ALL_SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]
AXE_OPTIONS = {
    "runOnly": {"type": "rule", "values": list(RULE_TO_SC)},
    "resultTypes": ["violations", "incomplete"],
    "iframes": True,
    "elementRef": False,
}
BOX_JS = """(targets) => targets.map(t => {
  try {
    let root = document, el = null;
    for (let i = 0; i < t.length; i++) {
      el = (Array.isArray(t[i]) ? null : root.querySelector(t[i]));
      if (!el) return null;
      if (i < t.length - 1) { root = el.contentDocument; if (!root) return null; }
    }
    const r = el.getBoundingClientRect();
    return {x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY),
      w: Math.round(r.width), h: Math.round(r.height)};
  } catch (e) { return null; }
})"""
MODE = "snapshot"


def to_raw_findings(axe_result: dict[str, Any], boxes_for: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for kind, key in (("violation", "violations"), ("needs-review", "incomplete")):
        for rule in axe_result.get(key, []):
            sc = RULE_TO_SC.get(rule["id"])
            if not sc:
                continue
            nodes = rule.get("nodes", [])
            boxes = boxes_for([n["target"] for n in nodes])
            for node, box in zip(nodes, boxes, strict=True):
                out.append(
                    {
                        "sc": sc,
                        "rule": rule["id"],
                        "kind": kind,
                        "impact": node.get("impact") or rule.get("impact"),
                        "bbox": box,
                        "target": node["target"],
                        "summary": (node.get("failureSummary") or "")[:300],
                    }
                )
    return out


class AxeRunner:
    """axe-core 4.13 over the capture's saved DOM, laid out at the capture's viewport.

    Mirrors the benchmark baseline (run_baseline.py, snapshot mode): scripts stripped,
    `<base href>` added, network left on so a page's own CSS can load.
    """

    def __init__(self, headless: bool = True) -> None:
        self._pw = browser.acquire()
        try:
            self._browser = self._pw.chromium.launch(headless=headless)
        except Exception:
            browser.release()
            raise
        self._axe_src = AXE_PATH.read_text(encoding="utf-8")

    def __enter__(self) -> AxeRunner:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        try:
            self._browser.close()
        finally:
            browser.release()

    def run(self, capture: Capture) -> dict[str, Any]:
        spec = capture.viewport_spec
        ctx = self._browser.new_context(
            viewport={"width": spec.width, "height": spec.height},
            device_scale_factor=1,
            is_mobile=spec.is_mobile,
            has_touch=spec.has_touch,
            bypass_csp=True,
            locale="en-US",
            timezone_id="UTC",
            ignore_https_errors=True,
        )
        page = ctx.new_page()
        page.set_default_timeout(30000)
        try:
            page.set_content(
                snapshot_html(capture.path, capture.meta), wait_until="domcontentloaded"
            )
            with contextlib.suppress(Exception):
                page.wait_for_load_state("networkidle", timeout=8000)
            page.wait_for_timeout(1000)
            page.add_script_tag(content=self._axe_src)
            result = page.evaluate("(opts) => axe.run(document, opts)", AXE_OPTIONS)
            findings = to_raw_findings(result, lambda ts: page.evaluate(BOX_JS, ts))
            axe_version = page.evaluate("() => axe.version")
        finally:
            ctx.close()
        return {
            "page_id": capture.path.name,
            "origin": capture.meta["origin"],
            "viewport": capture.meta["viewport"],
            "mode": MODE,
            "axe_version": axe_version,
            "covered_scs": COVERED_SCS,
            "not_covered_scs": [s for s in ALL_SCS if s not in COVERED_SCS],
            "findings": findings,
        }


def dumps(result: dict[str, Any]) -> str:
    return json.dumps(result, indent=1)
