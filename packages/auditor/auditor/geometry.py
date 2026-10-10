from __future__ import annotations

from auditor.schema import BBox


def iou(a: BBox, b: BBox) -> float:
    iw = max(0.0, min(a.x + a.w, b.x + b.w) - max(a.x, b.x))
    ih = max(0.0, min(a.y + a.h, b.y + b.h) - max(a.y, b.y))
    inter = iw * ih
    union = a.w * a.h + b.w * b.h - inter
    return inter / union if union > 0 else 0.0


def containment(inner: BBox, outer: BBox) -> float:
    """Fraction of `inner`'s own area lying inside `outer`."""
    iw = max(0.0, min(inner.x + inner.w, outer.x + outer.w) - max(inner.x, outer.x))
    ih = max(0.0, min(inner.y + inner.h, outer.y + outer.h) - max(inner.y, outer.y))
    area = inner.w * inner.h
    return (iw * ih) / area if area > 0 else 0.0
