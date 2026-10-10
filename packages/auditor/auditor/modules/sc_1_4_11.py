from __future__ import annotations

import math

import numpy as np

from auditor.elements.base import Element
from auditor.modules.color import (
    RGB,
    contrast_ratio,
    hex_of,
    median_color,
    mode_color,
    score_from_margin,
)
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Finding

SC = "1.4.11"
GUIDANCE_KEY = "1.4.11/non-text-contrast"
FIELD_KINDS = {"input", "choice"}
LABELLED_KINDS = {"button", "link"}
EXCEPTIONS = ["disabled", "unstyled-native", "visible-label", "slider-handle (O6, not measured)"]


def _ring(img: np.ndarray, x0: int, y0: int, x1: int, y1: int, skip: int) -> np.ndarray:
    return np.concatenate(
        [
            img[y0, x0 + skip : x1 - skip].reshape(-1, 3),
            img[y1 - 1, x0 + skip : x1 - skip].reshape(-1, 3),
            img[y0 + skip : y1 - skip, x0].reshape(-1, 3),
            img[y0 + skip : y1 - skip, x1 - 1].reshape(-1, 3),
        ]
    )


def _outside(
    img: np.ndarray, x0: int, y0: int, x1: int, y1: int, gap: int, skip: int
) -> np.ndarray:
    h, w = img.shape[:2]
    parts = []
    if y0 - gap >= 0:
        parts.append(img[y0 - gap, x0 + skip : x1 - skip])
    if y1 + gap - 1 < h:
        parts.append(img[y1 + gap - 1, x0 + skip : x1 - skip])
    if x0 - gap >= 0:
        parts.append(img[y0 + skip : y1 - skip, x0 - gap])
    if x1 + gap - 1 < w:
        parts.append(img[y0 + skip : y1 - skip, x1 + gap - 1])
    return np.concatenate([p.reshape(-1, 3) for p in parts]) if parts else np.empty((0, 3))


def _boundary(ctx: ModuleContext, el: Element) -> tuple[RGB, RGB, RGB] | None:
    """(edge, fill, outside) colours. The edge is the outermost or next-inner 1-px ring,
    whichever contrasts more with the outside, which tolerates sub-pixel box placement."""
    h = ctx.protocol.heuristics
    box = el.bbox_css
    if not all(math.isfinite(v) for v in (box.x, box.y, box.w, box.h)):
        return None
    x0, y0 = math.floor(box.x), math.floor(box.y)
    x1, y1 = math.ceil(box.x + box.w), math.ceil(box.y + box.h)
    img = ctx.image
    height, width = img.shape[:2]
    if x0 < 0 or y0 < 0 or x1 > width or y1 > height or x1 - x0 < 4 or y1 - y0 < 4:
        return None
    skip = h.ring_corner_skip_px if min(x1 - x0, y1 - y0) > 2 * h.ring_corner_skip_px else 0
    outside_px = _outside(img, x0, y0, x1, y1, h.ring_outside_gap_px, skip)
    if outside_px.size == 0:
        return None
    outside = median_color(outside_px)
    outer = median_color(_ring(img, x0, y0, x1, y1, skip))
    inner = median_color(_ring(img, x0 + 1, y0 + 1, x1 - 1, y1 - 1, skip))
    edge = max((outer, inner), key=lambda c: contrast_ratio(c, outside))
    pad = min(h.ring_inset_px, (x1 - x0) // 2, (y1 - y0) // 2)
    fill_px = img[y0 + pad : y1 - pad, x0 + pad : x1 - pad]
    if fill_px.size == 0:
        return None
    return edge, median_color(fill_px), outside


def _exception(el: Element) -> str | None:
    if el.is_disabled:
        return "disabled"
    if el.is_native and el.style.get("unstyled_native") is True:
        return "unstyled-native"
    if el.kind in LABELLED_KINDS and el.text:
        return "visible-label"
    if el.kind == "slider":
        return "slider-handle"
    return None


def _icon_ratio(ctx: ModuleContext, el: Element) -> tuple[float, RGB, RGB] | None:
    """O2: an icon-only control must show its icon at the non-text threshold. Estimated from
    pixels (strokes anti-alias lighter than their colour), so findings are needs-review."""
    b = el.bbox_css
    crop = ctx.crop(b.x, b.y, b.x + b.w, b.y + b.h)
    if crop.size == 0:
        return None
    bg = mode_color(crop)
    flat = crop.reshape(-1, 3).astype(np.float64)
    dist = np.linalg.norm(flat - np.array(bg, dtype=np.float64), axis=1)
    if dist.max() == 0:
        return None
    take = max(3, len(dist) // 50)
    far = flat[np.argsort(dist)[-take:]].mean(axis=0)
    fg = (round(float(far[0])), round(float(far[1])), round(float(far[2])))
    return contrast_ratio(fg, bg), fg, bg


def _finding(
    el: Element, ratio: float, threshold: float, tier: str, evidence: dict[str, object]
) -> Finding:
    box = el.bbox_css
    return Finding(
        sc=SC,
        bbox=BBox(x=box.x, y=box.y, w=box.w, h=box.h),
        severity="serious",
        tier=tier,
        score=score_from_margin(ratio, threshold),
        provenance="pixel",
        evidence={
            "ratio": math.floor(ratio * 100) / 100,
            "threshold": threshold,
            "dom_ref": el.dom_ref,
            "exception_tested": EXCEPTIONS,
            **evidence,
        },
        guidance_key=GUIDANCE_KEY,
    )


def run(ctx: ModuleContext) -> list[Finding]:
    threshold = ctx.protocol.thresholds.contrast.non_text
    findings: list[Finding] = []
    for el in ctx.elements:
        if _exception(el):
            continue
        if el.kind in FIELD_KINDS:
            sampled = _boundary(ctx, el)
            if sampled is None:
                continue
            edge, fill, outside = sampled
            border_ratio, fill_ratio = contrast_ratio(edge, outside), contrast_ratio(fill, outside)
            best = max(border_ratio, fill_ratio)
            if best < threshold:
                findings.append(
                    _finding(
                        el,
                        best,
                        threshold,
                        "automated",
                        {
                            "border_ratio": math.floor(border_ratio * 100) / 100,
                            "fill_ratio": math.floor(fill_ratio * 100) / 100,
                            "border": hex_of(edge),
                            "fill": hex_of(fill),
                            "outside": hex_of(outside),
                            "method": "boundary-ring",
                        },
                    )
                )
        elif el.kind in LABELLED_KINDS:
            icon = _icon_ratio(ctx, el)
            if icon is not None and icon[0] < threshold:
                ratio, fg, bg = icon
                findings.append(
                    _finding(
                        el,
                        ratio,
                        threshold,
                        "needs-review",
                        {"icon": hex_of(fg), "background": hex_of(bg), "method": "icon-only (O2)"},
                    )
                )
    return findings
