from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from auditor.modules.color import contrast_array, mode_color
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, FocusStep


@dataclass(frozen=True)
class StopDiff:
    """Pixel difference between the focused and unfocused views around one focus stop."""

    step: FocusStep
    scale: float
    rect_png: tuple[int, int, int, int]
    crop_origin: tuple[int, int]
    on_pixels: np.ndarray
    changed: np.ndarray
    added: np.ndarray
    ratio: np.ndarray
    clipped: dict[str, bool]
    unsettled: bool

    @property
    def changed_px(self) -> int:
        return int(self.changed.sum())

    def changed_inside_rect(self) -> int:
        x0, y0, x1, y1 = self.rect_png
        h, w = self.changed.shape
        return int(self.changed[max(0, y0) : min(h, y1), max(0, x0) : min(w, x1)].sum())

    @property
    def added_px(self) -> int:
        return int(self.added.sum())

    def median_contrast(self) -> float | None:
        values = self.ratio[self.added]
        return float(np.median(values)) if values.size else None

    def max_contrast(self) -> float | None:
        """PLAN §4.3: the strongest state contrast among the added pixels (R1 compares the change
        itself with the visibility ratio, so a faint fill change must not mask a crisp border)."""
        values = self.ratio[self.added]
        return float(values.max()) if values.size else None


def document_box(step: FocusStep) -> BBox:
    r, sc = step.rect, step.scroll
    return BBox(x=r.x + sc["x"], y=r.y + sc["y"], w=r.w, h=r.h)


def usable(step: FocusStep) -> bool:
    r = step.rect
    return all(math.isfinite(v) for v in (r.x, r.y, r.w, r.h)) and r.w > 0 and r.h > 0


def analyse(ctx: ModuleContext, step: FocusStep) -> StopDiff | None:
    """None when the stop cannot be judged: no images, zero-size rect, or rect outside the view.
    Cached per stop on the context."""
    key = ("diff", step.index)
    if key not in ctx.cache:
        ctx.cache[key] = _analyse(ctx, step)
    cached = ctx.cache[key]
    return cached if isinstance(cached, StopDiff) else None


def _analyse(ctx: ModuleContext, step: FocusStep) -> StopDiff | None:
    pair = ctx.focus.get(step.index)
    if pair is None or not usable(step) or pair.on.shape != pair.off.shape:
        return None
    h = ctx.protocol.heuristics
    scale = step.png_scale or 1.0
    height, width = pair.on.shape[:2]
    r = step.rect
    pad = h.focus_pad_px
    x0, y0 = max(0, math.floor((r.x - pad) * scale)), max(0, math.floor((r.y - pad) * scale))
    x1, y1 = (
        min(width, math.ceil((r.x + r.w + pad) * scale)),
        min(height, math.ceil((r.y + r.h + pad) * scale)),
    )
    if (
        x1 <= x0
        or y1 <= y0
        or r.x * scale >= width
        or r.y * scale >= height
        or r.x + r.w <= 0
        or r.y + r.h <= 0
    ):
        return None
    on, off = pair.on[y0:y1, x0:x1], pair.off[y0:y1, x0:x1]
    delta = h.focus_changed_pixel_delta
    diff = np.abs(on.astype(np.int16) - off.astype(np.int16)).sum(axis=2)
    changed = diff > delta
    rx0, ry0 = round(r.x * scale) - x0, round(r.y * scale) - y0
    rx1, ry1 = round((r.x + r.w) * scale) - x0, round((r.y + r.h) * scale) - y0
    frame = np.ones(off.shape[:2], dtype=bool)
    frame[max(0, ry0) : max(0, ry1), max(0, rx0) : max(0, rx1)] = False
    bg = np.array(mode_color(off[frame] if frame.any() else off), dtype=np.float64)
    dist_on = np.linalg.norm(on.astype(np.float64) - bg, axis=2)
    dist_off = np.linalg.norm(off.astype(np.float64) - bg, axis=2)
    added = changed & (dist_on > dist_off)
    ratio = contrast_array(on, off)
    outside = np.ones((height, width), dtype=bool)
    outside[y0:y1, x0:x1] = False
    full = np.abs(pair.on.astype(np.int16) - pair.off.astype(np.int16)).sum(axis=2) > delta
    outside_px = int(outside.sum())
    unsettled = bool(
        outside_px and (full & outside).sum() / outside_px > h.focus_unsettled_fraction
    )
    clipped = {
        "top": y0 == 0 and r.y - pad < 0,
        "left": x0 == 0 and r.x - pad < 0,
        "bottom": y1 == height and math.ceil((r.y + r.h + pad) * scale) > height,
        "right": x1 == width and math.ceil((r.x + r.w + pad) * scale) > width,
    }  # candidates only: the pad band meets the view edge; sc_2_4_13 decides whether O1 applies
    return StopDiff(
        step=step,
        scale=scale,
        rect_png=(
            round(r.x * scale) - x0,
            round(r.y * scale) - y0,
            round((r.x + r.w) * scale) - x0,
            round((r.y + r.h) * scale) - y0,
        ),
        crop_origin=(x0, y0),
        on_pixels=on,
        changed=changed,
        added=added,
        ratio=ratio,
        clipped=clipped,
        unsettled=unsettled,
    )


def coverage_fraction(ctx: ModuleContext, step: FocusStep) -> float | None:
    """Share of a 5x5 grid of points on the focused rect that sit under an opaque fixed or
    sticky region (viewport coordinates). None when the capture has no element geometry."""
    if not ctx.has_geometry or not usable(step):
        return None
    r = step.rect
    regions = []
    for el in ctx.elements:
        if el.kind not in {"fixed_region", "sticky_region"} or el.style.get("alpha", 0) < 1:
            continue
        if el.kind == "sticky_region" and (step.scroll["x"] or step.scroll["y"]):
            continue
        if step.selector and step.selector in (el.style.get("contains_refs") or []):
            continue
        regions.append(el.bbox_css)
    n = math.ceil(math.sqrt(ctx.protocol.heuristics.focus_obscured_sample_points))
    covered = 0
    for i in range(n):
        for j in range(n):
            px, py = r.x + (i + 0.5) * r.w / n, r.y + (j + 0.5) * r.h / n
            if any(b.x <= px <= b.x + b.w and b.y <= py <= b.y + b.h for b in regions):
                covered += 1
    return covered / (n * n)


def entirely_covered(ctx: ModuleContext, step: FocusStep) -> bool:
    fraction = coverage_fraction(ctx, step)
    return fraction is not None and fraction >= 1.0
