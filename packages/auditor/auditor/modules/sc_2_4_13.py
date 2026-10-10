from __future__ import annotations

import numpy as np

from auditor.modules.color import score_from_margin
from auditor.modules.context import ModuleContext
from auditor.modules.focus_common import StopDiff, analyse, document_box, entirely_covered
from auditor.schema import Finding

SC = "2.4.13"
GUIDANCE_KEY = "2.4.13/focus-appearance"


def _longest_runs(mask: np.ndarray, axis: int) -> np.ndarray:
    """Longest consecutive True run for every line of `mask` along `axis`."""
    lines = mask if axis == 1 else mask.T
    run = np.zeros(lines.shape[0], dtype=np.int64)
    best = np.zeros(lines.shape[0], dtype=np.int64)
    for j in range(lines.shape[1]):
        run = (run + 1) * lines[:, j]
        best = np.maximum(best, run)
    return best


def _bands(
    diff: StopDiff, strong: np.ndarray, ring_px: float, skip_px: float, margin: float
) -> dict[str, tuple[np.ndarray, int]]:
    x0, y0, x1, y1 = diff.rect_png
    h, w = strong.shape
    floor = int(round(skip_px * diff.scale))
    sx = max(floor, int((x1 - x0) * margin))
    sy = max(floor, int((y1 - y0) * margin))
    inner = max(1, int(round(ring_px * diff.scale)))

    def clip(lo: int, hi: int, size: int) -> slice:
        return slice(min(max(0, lo), size), min(max(0, hi), size))

    cols, rows = clip(x0 + sx, x1 - sx, w), clip(y0 + sy, y1 - sy, h)
    return {
        "top": (strong[clip(0, y0 + inner, h), cols], 0),
        "bottom": (strong[clip(y1 - inner, h, h), cols], 0),
        "left": (strong[rows, clip(0, x0 + inner, w)], 1),
        "right": (strong[rows, clip(x1 - inner, w, w)], 1),
    }


def _sides(
    diff: StopDiff, strong: np.ndarray, ring_px: float, skip_px: float, margin: float
) -> dict[str, dict[str, object]]:
    """Per-side ring check over the central span. `thickness_px` is the median run inside a
    band only ring_min_px thick, so it is capped near that value (evidence, not a measurement of
    thicker rings). A side whose pad band meets the view edge and shows no strong pixel at all
    counts as clipped (O1) when the other sides are complete."""
    need = max(1, int(round(ring_px * diff.scale)))
    out: dict[str, dict[str, object]] = {}
    for side, (band, axis) in _bands(diff, strong, ring_px, skip_px, margin).items():
        if band.size == 0:
            out[side] = {"complete": True, "judged": False, "clipped": False, "thickness_px": None}
            continue
        runs = _longest_runs(band, axis)
        out[side] = {
            "complete": bool((runs >= need).all()),
            "judged": True,
            "clipped": False,
            "thickness_px": float(np.median(runs)) / diff.scale,
            "_empty": not bool(band.any()),
        }

    def others_ok(skip: str) -> bool:
        return all(bool(v["complete"]) for k, v in out.items() if k != skip)

    for side, info in out.items():
        if diff.clipped[side] and info.get("_empty") and others_ok(side):
            info["complete"], info["clipped"] = True, True
        info.pop("_empty", None)
    return out


def _is_ua_default_ring(diff: StopDiff, rgb: list[int], tolerance: int, min_share: float) -> bool:
    """The browser's own focus ring (colour pinned to the capture tool's Chromium); exempt only
    when `ua_default_ring_exempt` is set (off by default, ADR-028)."""
    if not diff.added.any():
        return False
    pixels = diff.on_pixels[diff.added].astype(np.int16)
    close = np.abs(pixels - np.array(rgb, dtype=np.int16)).sum(axis=1) <= tolerance
    return bool(close.mean() >= min_share)


def run(ctx: ModuleContext) -> list[Finding]:
    """Each side is judged over its central span (the outer quarter at each end is skipped) so
    rounded corners never decide R5.

    R1 first (no visible indicator: 2.4.13 is not applicable), then the unstyled default ring
    (exempt only when `ua_default_ring_exempt` is set), then R5 (a complete solid ring of at
    least the minimum thickness at the minimum contrast on every visible side meets), then O4
    (changed pixels at the minimum contrast must reach area_factor x (w + h))."""
    th = ctx.protocol.thresholds
    h = ctx.protocol.heuristics
    findings: list[Finding] = []
    for step in ctx.capture.focus_steps:
        diff = analyse(ctx, step)
        if diff is None or entirely_covered(ctx, step):
            continue
        strongest = diff.max_contrast()
        if strongest is None or strongest < th.focus.visibility_ratio:
            continue
        if h.ua_default_ring_exempt and _is_ua_default_ring(
            diff, h.ua_focus_ring_rgb, h.focus_changed_pixel_delta, h.ua_ring_min_share
        ):
            continue
        strong = diff.added & (diff.ratio >= th.focus.ring_min_contrast)
        sides = _sides(
            diff, strong, th.focus.ring_min_px, h.ring_corner_skip_px, h.ring_side_margin_fraction
        )
        if all(bool(s["complete"]) for s in sides.values()):
            continue
        rect = step.rect
        area_css = float(strong.sum()) / (diff.scale**2)
        required = th.focus.area_factor * (rect.w + rect.h)
        if area_css >= required:
            continue
        findings.append(
            Finding(
                sc=SC,
                bbox=document_box(step),
                focus_index=step.index,
                severity="minor",
                tier="needs-review" if diff.unsettled else "automated",
                score=score_from_margin(area_css, required),
                provenance="pixel",
                evidence={
                    "rule": "R5 then O4",
                    "ring_sides": sides,
                    "strong_area_css": round(area_css, 1),
                    "required_area_css": round(required, 1),
                    "ring_min_px": th.focus.ring_min_px,
                    "ring_min_contrast": th.focus.ring_min_contrast,
                    "state_contrast_max": round(strongest, 2),
                    "png_scale": diff.scale,
                    "unsettled": diff.unsettled,
                    "selector": step.selector,
                    "method": "focus-pair-diff",
                },
                guidance_key=GUIDANCE_KEY,
            )
        )
    return findings
