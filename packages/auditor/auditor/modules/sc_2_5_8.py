from __future__ import annotations

import math

from auditor.elements.base import Element
from auditor.modules.color import score_from_margin
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Finding

SC = "2.5.8"
GUIDANCE_KEY = "2.5.8/target-size"
TARGET_KINDS = {"link", "button", "input", "choice", "slider"}


def _center(el: Element) -> tuple[float, float]:
    b = el.bbox_css
    return b.x + b.w / 2, b.y + b.h / 2


def _gap_to_point(el: Element, point: tuple[float, float]) -> float:
    b = el.bbox_css
    dx = max(b.x - point[0], 0.0, point[0] - (b.x + b.w))
    dy = max(b.y - point[1], 0.0, point[1] - (b.y + b.h))
    return math.hypot(dx, dy)


def _parent_ref(ref: str | None) -> str | None:
    if not ref or " > " not in ref:
        return None
    return ref.rsplit(" > ", 1)[0]


def _inline(el: Element, texts: list[Element], size: float) -> bool:
    if el.kind != "link":
        return False
    parent = _parent_ref(el.dom_ref)
    b = el.bbox_css
    for t in texts:
        if t.dom_ref != parent:
            continue
        tb = t.bbox_css
        overlap = min(b.y + b.h, tb.y + tb.h) - max(b.y, tb.y)
        gap = max(tb.x - (b.x + b.w), b.x - (tb.x + tb.w), 0.0)
        if overlap >= b.h / 2 and gap <= size / 2:
            return True
    return False


def _contains(a: Element, b: Element) -> bool:
    x, y = a.bbox_css, b.bbox_css
    return x.x <= y.x and x.y <= y.y and x.x + x.w >= y.x + y.w and x.y + x.h >= y.y + y.h


def _valid(el: Element) -> bool:
    b = el.bbox_css
    return all(math.isfinite(v) for v in (b.x, b.y, b.w, b.h)) and b.w > 0 and b.h > 0


def _spacing_exempt(el: Element, others: list[Element], size: float) -> bool:
    radius = size / 2
    c = _center(el)
    for o in others:
        if _gap_to_point(o, c) < radius:
            return False
        ob = o.bbox_css
        if (ob.w < size or ob.h < size) and math.dist(c, _center(o)) < size:
            return False
    return True


def run(ctx: ModuleContext) -> list[Finding]:
    size = ctx.protocol.thresholds.target_size_px
    targets = [e for e in ctx.elements if e.kind in TARGET_KINDS and _valid(e)]
    texts = [e for e in ctx.elements if e.kind == "text"]
    findings: list[Finding] = []
    for el in targets:
        b = el.bbox_css
        if el.is_disabled or (b.w >= size and b.h >= size):
            continue
        tested: list[dict[str, object]] = []
        user_agent = el.is_native and el.style.get("unstyled_native") is True
        tested.append({"exception": "user-agent", "applies": user_agent})
        if user_agent:
            continue
        inline = _inline(el, texts, size)
        tested.append({"exception": "inline", "applies": inline})
        if inline:
            continue
        others = [
            o for o in targets if o is not el and not _contains(el, o) and not _contains(o, el)
        ]
        spacing = _spacing_exempt(el, others, size)
        tested.append({"exception": "spacing", "applies": spacing})
        if spacing:
            continue
        tested.append({"exception": "equivalent", "applies": None, "note": "not modelled"})
        findings.append(
            Finding(
                sc=SC,
                bbox=BBox(x=b.x, y=b.y, w=b.w, h=b.h),
                severity="serious",
                tier="automated",
                score=score_from_margin(min(b.w, b.h), size),
                provenance="pixel",
                evidence={
                    "size_px": {"w": b.w, "h": b.h},
                    "threshold": size,
                    "kind": el.kind,
                    "exception_tested": tested,
                    "method": "dom-box",
                    "dom_ref": el.dom_ref,
                    "text": el.text,
                },
                guidance_key=GUIDANCE_KEY,
            )
        )
    return findings
