from __future__ import annotations

from dataclasses import dataclass, field

from auditor.eval.units import containment, iou
from auditor.schema import BBox


@dataclass
class PageMatch:
    tp: int = 0
    fp: int = 0
    fn: int = 0
    duplicates: int = 0
    unmatched_findings: list[BBox] = field(default_factory=list)
    unmatched_truth: list[BBox] = field(default_factory=list)


def match_boxes(
    findings: list[BBox],
    truth: list[BBox],
    iou_threshold: float,
    containment_threshold: float,
    use_containment: bool = True,
) -> PageMatch:
    """ADR-013: a finding matches a truth box if IoU >= iou_threshold, or (when enabled) at least
    containment_threshold of its own area lies inside the truth box. Findings matched to a truth
    box that already has a match are merged duplicates, not false positives. A truth box counts as
    found if any finding matches it, so one finding may cover several truth boxes."""
    result = PageMatch()
    hit: set[int] = set()
    matched_findings = 0
    for f in findings:
        matches = [
            j
            for j, t in enumerate(truth)
            if iou(f, t) >= iou_threshold
            or (use_containment and containment(f, t) >= containment_threshold)
        ]
        if not matches:
            result.fp += 1
            result.unmatched_findings.append(f)
            continue
        matched_findings += 1
        hit.update(matches)
    result.tp = len(hit)
    result.duplicates = max(0, matched_findings - result.tp)
    for j, t in enumerate(truth):
        if j not in hit:
            result.fn += 1
            result.unmatched_truth.append(t)
    return result
