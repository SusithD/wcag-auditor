from __future__ import annotations

import math

import numpy as np

from auditor.elements.base import Element
from auditor.modules.color import RGB, contrast_ratio, hex_of, median_color, score_from_margin
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Finding

SC = "1.4.11"
GUIDANCE_KEY = "1.4.11/non-text-contrast"
EVALUATED_KINDS = {"input", "choice"}
OUTSIDE_GAP = 2
CORNER_SKIP = 4
INSET = 4


def _strips(ctx: ModuleContext, el: Element) -> tuple[RGB, RGB, RGB] | None:
    box = el.bbox_css
    x0, y0 = round(box.x), round(box.y)
    x1, y1 = round(box.x + box.w), round(box.y + box.h)
    h_img, w_img = ctx.image.shape[:2]
    if x1 - x0 < 2 or y1 - y0 < 2 or x0 < OUTSIDE_GAP or y0 < OUTSIDE_GAP:
        return None
    if x1 + OUTSIDE_GAP >= w_img or y1 + OUTSIDE_GAP >= h_img:
        return None
    img = ctx.image
    skip = CORNER_SKIP if min(x1 - x0, y1 - y0) > 2 * CORNER_SKIP else 0
    edge = np.concatenate(
        [
            img[y0, x0 + skip : x1 - skip].reshape(-1, 3),
            img[y1 - 1, x0 + skip : x1 - skip].reshape(-1, 3),
            img[y0 + skip : y1 - skip, x0].reshape(-1, 3),
            img[y0 + skip : y1 - skip, x1 - 1].reshape(-1, 3),
        ]
    )
    g = OUTSIDE_GAP
    outside = np.concatenate(
        [
            img[y0 - g, x0 + skip : x1 - skip].reshape(-1, 3),
            img[y1 + g - 1, x0 + skip : x1 - skip].reshape(-1, 3),
            img[y0 + skip : y1 - skip, x0 - g].reshape(-1, 3),
            img[y0 + skip : y1 - skip, x1 + g - 1].reshape(-1, 3),
        ]
    )
    pad = min(INSET, (x1 - x0) // 2, (y1 - y0) // 2)
    inside = img[y0 + pad : y1 - pad, x0 + pad : x1 - pad]
    if edge.size == 0 or outside.size == 0 or inside.size == 0:
        return None
    return median_color(edge), median_color(inside), median_color(outside)


def _exception(el: Element) -> str | None:
    if el.is_disabled:
        return "disabled"
    if el.is_native and el.style.get("unstyled_native") is True:
        return "unstyled-native"
    return None


def run(ctx: ModuleContext) -> list[Finding]:
    threshold = ctx.protocol.thresholds.contrast.non_text
    findings: list[Finding] = []
    for el in ctx.elements:
        if el.kind not in EVALUATED_KINDS or _exception(el):
            continue
        sampled = _strips(ctx, el)
        if sampled is None:
            continue
        edge, inside, outside = sampled
        border_ratio = contrast_ratio(edge, outside)
        fill_ratio = contrast_ratio(inside, outside)
        best = max(border_ratio, fill_ratio)
        if best >= threshold:
            continue
        sev = ctx.protocol.severity.contrast
        box = el.bbox_css
        findings.append(
            Finding(
                sc=SC,  # type: ignore[arg-type]
                bbox=BBox(x=box.x, y=box.y, w=box.w, h=box.h),
                severity="serious" if best < sev.serious_below_large else "minor",
                tier="automated",
                score=score_from_margin(best, threshold),
                provenance="pixel",
                evidence={
                    "ratio": math.floor(best * 100) / 100,
                    "threshold": threshold,
                    "border_ratio": math.floor(border_ratio * 100) / 100,
                    "fill_ratio": math.floor(fill_ratio * 100) / 100,
                    "border": hex_of(edge),
                    "fill": hex_of(inside),
                    "outside": hex_of(outside),
                    "method": "boundary-ring",
                    "dom_ref": el.dom_ref,
                    "exception_tested": ["disabled", "unstyled-native"],
                },
                guidance_key=GUIDANCE_KEY,
            )
        )
    return findings
