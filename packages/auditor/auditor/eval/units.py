from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from auditor import protocol
from auditor.geometry import containment, iou
from auditor.schema import BBox, Capture

SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]
FOCUS_SCS = ["2.4.7", "2.4.11", "2.4.12", "2.4.13"]
PAGE_SCS = [sc for sc in SCS if sc not in FOCUS_SCS]


def stop_truth(judgment: dict[str, Any]) -> dict[str, bool]:
    """Per-stop positives from a ground-truth judgment (ported from agreement.stop_positive).

    R6: a `not-assessable` field leaves that SC out of the stop's units; `na` counts as negative.
    """
    out: dict[str, bool] = {}
    if judgment.get("v247") != "not-assessable":
        out["2.4.7"] = judgment.get("v247") == "no"
    obs = judgment.get("obs")
    out["2.4.11"] = obs == "entire"
    out["2.4.12"] = obs in ("entire", "partial")
    if judgment.get("v2413") != "not-assessable":
        out["2.4.13"] = judgment.get("v2413") == "fails"
    return out


@dataclass
class ItemTruth:
    page_id: str
    viewport: str
    stratum: str
    scored_scs: set[str]
    page_boxes: dict[str, list[BBox]] = field(default_factory=dict)
    stops: dict[int, dict[str, bool]] = field(default_factory=dict)


@dataclass
class Prediction:
    page_boxes: dict[str, list[BBox]] = field(default_factory=dict)
    stops: dict[str, set[int]] = field(default_factory=dict)


def _boxes(annotations: list[dict[str, Any]]) -> dict[str, list[BBox]]:
    out: dict[str, list[BBox]] = {}
    for ann in annotations:
        if ann["sc"] in PAGE_SCS:
            out.setdefault(ann["sc"], []).append(BBox.model_validate(ann["bbox"]))
    return out


def real_truth(item: dict[str, Any], excluded: set[str]) -> ItemTruth:
    truth = ItemTruth(item["page_id"], item["viewport"], "real", set(SCS))
    truth.page_boxes = _boxes(item.get("annotations", []))
    for j in item.get("focus_judgments", []):
        if f"{item['page_id']}#{j['index']}" in excluded:
            continue
        truth.stops[j["index"]] = stop_truth(j)
    return truth


def synthetic_truth(capture: Capture, truth: dict[str, Any]) -> ItemTruth:
    """Synthetic pages are scored on their seeded SC only (2.4.11 pages also on 2.4.12)."""
    seeded = capture.meta.get("seeded_sc")
    scored = {seeded} if seeded else set()
    if seeded == "2.4.11":
        scored.add("2.4.12")
    match = protocol.load().thresholds.match
    item = ItemTruth(capture.path.name, capture.viewport, "synthetic", scored)
    item.page_boxes = _boxes(truth.get("annotations", []))
    rendered = {e["id"]: e["rect"] for e in capture.meta.get("test_elements_rendered", [])}
    annotated: dict[str, list[BBox]] = {}
    for ann in truth.get("annotations", []):
        if ann["sc"] in FOCUS_SCS:
            rect = rendered.get(ann.get("element_id", ""), ann["bbox"])
            annotated.setdefault(ann["sc"], []).append(BBox.model_validate(rect))
    for step in capture.focus_steps:
        rect = BBox(
            x=step.rect.x + step.scroll["x"],
            y=step.rect.y + step.scroll["y"],
            w=step.rect.w,
            h=step.rect.h,
        )
        positives = {
            sc: any(
                iou(rect, box) >= match.iou or containment(rect, box) >= match.containment
                for box in boxes
            )
            for sc, boxes in annotated.items()
        }
        row = {sc: positives.get(sc, False) for sc in FOCUS_SCS}
        if positives.get("2.4.11"):
            row["2.4.12"] = True
        item.stops[step.index] = row
    return item


def load_truth_file(path: Path) -> tuple[dict[str, dict[str, Any]], set[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {it["page_id"]: it for it in data["items"]}, set(data.get("excluded_focus_stops", []))
