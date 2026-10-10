from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from auditor.eval.match import match_boxes
from auditor.eval.units import FOCUS_SCS, PAGE_SCS, ItemTruth, Prediction
from auditor.schema import BBox


@dataclass
class UnitResult:
    page_id: str
    viewport: str
    stratum: str
    condition: str
    sc: str
    key: int | None
    tp: int
    fp: int
    fn: int
    tn: int
    duplicates: int
    truth_positive: bool
    predicted_positive: bool
    fp_boxes: list[BBox] = field(default_factory=list)
    fn_boxes: list[BBox] = field(default_factory=list)

    @property
    def correct(self) -> bool:
        if self.key is None:
            return self.fp == 0 and self.fn == 0
        return self.truth_positive == self.predicted_positive


@dataclass(frozen=True)
class MatchConfig:
    iou: float
    containment: float
    use_containment: bool = True


def score_item(
    truth: ItemTruth, pred: Prediction, condition: str, cfg: MatchConfig
) -> list[UnitResult]:
    out: list[UnitResult] = []
    for sc in PAGE_SCS:
        if sc not in truth.scored_scs:
            continue
        t_boxes = truth.page_boxes.get(sc, [])
        f_boxes = pred.page_boxes.get(sc, [])
        m = match_boxes(f_boxes, t_boxes, cfg.iou, cfg.containment, cfg.use_containment)
        out.append(
            UnitResult(
                truth.page_id,
                truth.viewport,
                truth.stratum,
                condition,
                sc,
                None,
                m.tp,
                m.fp,
                m.fn,
                int(not t_boxes and not f_boxes),
                m.duplicates,
                bool(t_boxes),
                bool(f_boxes),
                m.unmatched_findings,
                m.unmatched_truth,
            )
        )
    for index in sorted(truth.stops):
        for sc in FOCUS_SCS:
            if sc not in truth.scored_scs or sc not in truth.stops[index]:
                continue
            positive = truth.stops[index][sc]
            predicted = index in pred.stops.get(sc, set())
            out.append(
                UnitResult(
                    truth.page_id,
                    truth.viewport,
                    truth.stratum,
                    condition,
                    sc,
                    index,
                    int(positive and predicted),
                    int(predicted and not positive),
                    int(positive and not predicted),
                    int(not positive and not predicted),
                    0,
                    positive,
                    predicted,
                )
            )
    return out


def prf(tp: int, fp: int, fn: int) -> dict[str, float | None]:
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall
        else None
    )
    return {"precision": precision, "recall": recall, "f1": f1}


def aggregate(results: list[UnitResult]) -> dict[str, Any]:
    """metrics[condition][stratum][sc] = counts + P/R/F1 (stratum `combined` pools both)."""
    cells: dict[tuple[str, str, str], list[int]] = {}
    for r in results:
        for stratum in (r.stratum, "combined"):
            c = cells.setdefault((r.condition, stratum, r.sc), [0, 0, 0, 0, 0, 0])
            c[0] += r.tp
            c[1] += r.fp
            c[2] += r.fn
            c[3] += r.tn
            c[4] += r.duplicates
            c[5] += 1
    out: dict[str, Any] = {}
    for (cond, stratum, sc), (tp, fp, fn, tn, dup, units) in sorted(cells.items()):
        out.setdefault(cond, {}).setdefault(stratum, {})[sc] = {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn,
            "duplicates": dup,
            "units": units,
            **prf(tp, fp, fn),
        }
    return out
