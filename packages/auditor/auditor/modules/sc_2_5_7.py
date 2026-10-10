from __future__ import annotations

from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Finding

SC = "2.5.7"
GUIDANCE_KEY = "2.5.7/dragging"


def run(ctx: ModuleContext) -> list[Finding]:
    """DOM-only. A native range input passes. A custom slider (role=slider, not native) fails
    when no single-pointer alternative (button, input, select, link) sits in its widget
    container; severity critical (O7). Without element geometry the criterion is not assessable
    and nothing is reported."""
    findings: list[Finding] = []
    for el in ctx.elements:
        if el.kind != "slider" or el.is_native or el.is_disabled:
            continue
        alternatives = el.style.get("alternatives")
        if alternatives is None or alternatives:
            continue
        box = el.bbox_css
        findings.append(
            Finding(
                sc=SC,
                bbox=BBox(x=box.x, y=box.y, w=box.w, h=box.h),
                severity="critical",
                tier="automated",
                score=1.0,
                provenance="pixel",
                evidence={
                    "rule": "O7",
                    "alternatives_found": 0,
                    "widget_depth": ctx.protocol.heuristics.slider_widget_depth,
                    "dom_ref": el.dom_ref,
                    "exception_tested": ["native-range", "essential (not modelled)"],
                    "method": "dom-structure",
                },
                guidance_key=GUIDANCE_KEY,
            )
        )
    return findings
