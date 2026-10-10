from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image

from auditor import protocol as protocol_mod
from auditor.elements.base import Element
from auditor.frames import Frame
from auditor.geometry import containment, iou
from auditor.schema import BBox, Capture


def tile_ranges(height: int, tile: int, overlap: int) -> list[tuple[int, int]]:
    """Horizontal strips of at most `tile` rows; consecutive strips share `overlap` rows."""
    if height <= tile:
        return [(0, height)]
    step = max(1, tile - overlap)
    ranges: list[tuple[int, int]] = []
    y = 0
    while True:
        end = min(height, y + tile)
        ranges.append((y, end))
        if end >= height:
            return ranges
        y += step


def polygon_box(polygon: list[list[float]]) -> BBox:
    xs, ys = [p[0] for p in polygon], [p[1] for p in polygon]
    return BBox(x=min(xs), y=min(ys), w=max(xs) - min(xs), h=max(ys) - min(ys))


def seam_bands(ranges: list[tuple[int, int]], margin: int) -> list[tuple[float, float]]:
    """Row bands around the places where two strips meet (the shared rows plus a margin)."""
    return [(ranges[i + 1][0] - margin, ranges[i][1] + margin) for i in range(len(ranges) - 1)]


def dedupe(
    lines: list[Element],
    iou_threshold: float,
    containment_threshold: float,
    bands: list[tuple[float, float]] | None = None,
) -> list[Element]:
    """Drop duplicate detections from overlapping tiles. Of two boxes that overlap by IoU or by
    containment of the smaller in the larger, keep the one with the larger area (the uncut line).
    With `bands`, only boxes touching a seam band are compared; the rest pass through untouched,
    so genuinely nested text elsewhere on the page is never merged."""

    def at_seam(e: Element) -> bool:
        if bands is None:
            return True
        top, bottom = e.bbox_css.y, e.bbox_css.y + e.bbox_css.h
        return any(top <= hi and bottom >= lo for lo, hi in bands)

    candidates = [e for e in lines if at_seam(e)]
    rest = [e for e in lines if not at_seam(e)]
    kept: list[Element] = []
    for line in sorted(candidates, key=lambda e: -(e.bbox_css.w * e.bbox_css.h)):
        small = line.bbox_css
        duplicate = any(
            iou(small, k.bbox_css) >= iou_threshold
            or containment(small, k.bbox_css) >= containment_threshold
            for k in kept
        )
        if not duplicate:
            kept.append(line)
    return sorted([*kept, *rest], key=lambda e: (e.bbox_css.y, e.bbox_css.x))


def ink_extent(crop: np.ndarray, delta: int) -> int:
    """Rows spanned by glyph ink: pixels whose summed channel difference from the most common
    colour exceeds `delta`. OCR boxes are padded, so their own height overstates the text."""
    if crop.size == 0:
        return 0
    flat = crop.reshape(-1, 3)
    packed = (flat[:, 0].astype(np.int64) << 16) | (flat[:, 1].astype(np.int64) << 8) | flat[:, 2]
    values, counts = np.unique(packed, return_counts=True)
    top = int(values[np.argmax(counts)])
    bg = np.array([top >> 16 & 255, top >> 8 & 255, top & 255], dtype=np.int16)
    ink = np.abs(crop.astype(np.int16) - bg).sum(axis=2) > delta
    rows = np.flatnonzero(ink.any(axis=1))
    return int(rows[-1] - rows[0] + 1) if rows.size else 0


class PixelElementSource:
    """Text lines read from the full-page screenshot with RapidOCR (ADR-012).

    Used where no element geometry exists (the benchmark's real pages). Boxes are in document CSS
    px (a full-page screenshot is 1 px = 1 CSS px). The foreground colour, size and weight are
    unknown, so lines carry only their recognised text, OCR score and line height.
    """

    def __init__(self, engine: Any = None) -> None:
        self._engine = engine

    def _ocr(self) -> Any:
        if self._engine is None:
            from rapidocr_onnxruntime import RapidOCR

            self._engine = RapidOCR()
        return self._engine

    def elements(self, capture: Capture) -> list[Element]:
        h = protocol_mod.load().heuristics
        match = protocol_mod.load().thresholds.match
        with Image.open(capture.path / "screenshot.png") as shot:
            image = np.asarray(shot.convert("RGB"))
        frame = Frame.full_page()
        lines: list[Element] = []
        ranges = tile_ranges(image.shape[0], h.ocr_tile_height_px, h.ocr_tile_overlap_px)
        for y0, y1 in ranges:
            result, _ = self._ocr()(np.ascontiguousarray(image[y0:y1]))
            for polygon, text, score in result or []:
                local = polygon_box(polygon)
                box = frame.png_to_document(BBox(x=local.x, y=local.y + y0, w=local.w, h=local.h))
                top, bottom = max(0, int(box.y)), min(image.shape[0], int(box.y + box.h) + 1)
                left, right = max(0, int(box.x)), min(image.shape[1], int(box.x + box.w) + 1)
                ink = ink_extent(image[top:bottom, left:right], h.focus_changed_pixel_delta)
                lines.append(
                    Element(
                        kind="text",
                        bbox_css=box,
                        text=str(text)[:120],
                        style={
                            "ocr_score": round(float(score), 3),
                            "box_height_px": box.h,
                            "ink_height_px": ink,
                        },
                    )
                )
        bands = seam_bands(ranges, h.ocr_tile_overlap_px)
        return dedupe(lines, match.iou, match.containment, bands)
