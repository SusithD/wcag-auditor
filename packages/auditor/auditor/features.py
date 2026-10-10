from __future__ import annotations

import numpy as np
from PIL import Image

from auditor import protocol
from auditor.elements.base import Element
from auditor.schema import Capture, PageFeatures

_LAYOUT_KINDS = {"fixed_region", "sticky_region"}
_PIXELS_PER_MEGAPIXEL = 1_000_000


def edge_density(screenshot: Image.Image, threshold: int) -> float:
    gray = np.asarray(screenshot.convert("L"), dtype=np.int16)
    if gray.shape[0] < 2 or gray.shape[1] < 2:
        return 0.0
    gx = np.abs(np.diff(gray, axis=1))[:-1, :]
    gy = np.abs(np.diff(gray, axis=0))[:, :-1]
    return float(np.mean((gx > threshold) | (gy > threshold)))


def is_non_responsive(capture: Capture) -> bool:
    layout = capture.layout
    return bool(
        capture.viewport_spec.is_mobile
        and layout is not None
        and not layout.has_meta_viewport
        and layout.layout_width > capture.viewport_spec.width
    )


def compute(capture: Capture, elements: list[Element] | None) -> PageFeatures:
    threshold = protocol.load().heuristics.edge_gradient_threshold
    with Image.open(capture.path / "screenshot.png") as shot:
        width, height = shot.size
        edges = edge_density(shot, threshold)
    measurable = [e for e in elements or [] if e.kind not in _LAYOUT_KINDS]
    return PageFeatures(
        edge_density=round(edges, 4),
        element_density=(
            None
            if elements is None
            else round(len(measurable) / (width * height / _PIXELS_PER_MEGAPIXEL), 2)
        ),
        focus_stop_count=len(capture.focus_steps),
        has_sticky=None if elements is None else any(e.kind in _LAYOUT_KINDS for e in elements),
        is_non_responsive=is_non_responsive(capture),
    )
