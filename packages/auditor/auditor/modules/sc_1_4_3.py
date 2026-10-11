from __future__ import annotations

import math
from typing import Any

import numpy as np

from auditor.elements.base import Element
from auditor.modules import reasons
from auditor.modules.color import (
    RGB,
    blend,
    contrast_ratio,
    hex_of,
    mode_color,
    parse_css_color,
    score_from_margin,
)
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Finding

SC = "1.4.3"
GUIDANCE_KEY = "1.4.3/contrast"


def _distance(pixels: np.ndarray, color: RGB) -> np.ndarray:
    return np.linalg.norm(pixels.astype(np.float64) - np.array(color, dtype=np.float64), axis=-1)


def _background(window: np.ndarray, fg: RGB) -> RGB | None:
    """Colour behind the glyphs: median of the pixels that are nearer the dominant colour
    than the foreground, which drops glyph and anti-aliasing pixels. When glyph pixels dominate
    the window, the most common colour that is not the foreground is used; None if there is none."""
    dominant = mode_color(window)
    reach = float(np.linalg.norm(np.array(dominant, dtype=np.float64) - np.array(fg)))
    if reach == 0:
        rest = window[np.any(window != np.array(fg, dtype=window.dtype), axis=-1)]
        return mode_color(rest) if rest.size else None
    bg_like = window[_distance(window, fg) >= reach / 2]
    if bg_like.size == 0:
        return dominant
    med = np.median(bg_like.reshape(-1, 3), axis=0)
    return (round(float(med[0])), round(float(med[1])), round(float(med[2])))


def _pixel_foreground(crop: np.ndarray) -> RGB:
    """Mean of the pixels farthest from the dominant colour (anti-aliasing never reaches the
    true colour on thin strokes, so this under-states contrast loss)."""
    dominant = mode_color(crop)
    dist = _distance(crop, dominant).reshape(-1)
    flat = crop.reshape(-1, 3)
    take = max(3, len(dist) // 50)
    far = flat[np.argsort(dist)[-take:]]
    mean = far.mean(axis=0)
    return (round(float(mean[0])), round(float(mean[1])), round(float(mean[2])))


def _windows(width: int, size: int) -> list[tuple[int, int]]:
    count = max(1, width // size)
    edges = [round(i * width / count) for i in range(count + 1)]
    return list(zip(edges[:-1], edges[1:], strict=True))


def _is_large(style: dict[str, Any], ctx: ModuleContext) -> bool | None:
    size, weight = style.get("font_size_px"), style.get("font_weight")
    if size is None or weight is None:
        line = style.get("ink_height_px")
        if line is not None and line >= ctx.protocol.heuristics.ocr_large_ink_height_px:
            return True
        return None
    lt = ctx.protocol.thresholds.large_text
    return bool(size >= lt.min_px or (size >= lt.min_px_bold and weight >= lt.bold_weight))


def _severity(ratio: float, large: bool | None, ctx: ModuleContext) -> str:
    sev = ctx.protocol.severity.contrast
    cutoff = sev.serious_below_large if large else sev.serious_below
    return "serious" if ratio < cutoff else "minor"


def _measure(ctx: ModuleContext, el: Element) -> tuple[float, RGB, RGB, int, str] | None:
    box = el.bbox_css
    crop = ctx.crop(box.x, box.y, box.x + box.w, box.y + box.h)
    if crop.size == 0 or crop.shape[0] < 1 or crop.shape[1] < 1:
        return None
    parsed = parse_css_color(el.style.get("color"))
    raw_opacity = el.style.get("opacity")
    opacity = 1.0 if raw_opacity is None or math.isnan(float(raw_opacity)) else float(raw_opacity)
    source = "dom"
    if parsed is None:
        fg_flat, alpha, source = _pixel_foreground(crop), 1.0, "pixel"
    else:
        fg_flat, alpha = parsed[0], parsed[1] * opacity
    worst: tuple[float, RGB, RGB, int] | None = None
    for start, end in _windows(crop.shape[1], ctx.protocol.heuristics.contrast_window_px):
        window = crop[:, start:end]
        bg = _background(window, fg_flat)
        if bg is None:
            continue
        fg = blend(fg_flat, bg, alpha) if alpha < 1 else fg_flat
        ratio = contrast_ratio(fg, bg)
        if worst is None or ratio < worst[0]:
            worst = (ratio, fg, bg, start)
    if worst is None:
        return None
    return (*worst, source)


def run(ctx: ModuleContext) -> list[Finding]:
    th = ctx.protocol.thresholds.contrast
    findings: list[Finding] = []
    for el in ctx.elements:
        if el.kind != "text" or el.is_disabled or el.style.get("in_svg"):
            continue
        measured = _measure(ctx, el)
        if measured is None:
            continue
        ratio, fg, bg, window_x, source = measured
        large = _is_large(el.style, ctx)
        threshold = th.large_text if large else th.text
        if ratio >= threshold:
            continue
        box = el.bbox_css
        findings.append(
            Finding(
                sc=SC,
                bbox=BBox(x=box.x, y=box.y, w=box.w, h=box.h),
                severity=_severity(ratio, large, ctx),
                tier="automated" if large is not None else "needs-review",
                score=score_from_margin(ratio, threshold),
                provenance="pixel",
                evidence={
                    "ratio": math.floor(ratio * 100) / 100,
                    "threshold": threshold,
                    "fg": hex_of(fg),
                    "bg": hex_of(bg),
                    "large_text": large,
                    "size_px": el.style.get("font_size_px"),
                    "font_weight": el.style.get("font_weight"),
                    "worst_window_x": window_x,
                    "method": source,
                    "text": el.text,
                    "dom_ref": el.dom_ref,
                    "exception_tested": ["disabled", "svg-text"],
                    **({} if large is not None else {reasons.KEY: reasons.TEXT_SIZE_UNKNOWN}),
                },
                guidance_key=GUIDANCE_KEY,
            )
        )
    return findings
