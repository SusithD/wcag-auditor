from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from auditor.eval.metrics import UnitResult

COLUMNS = [
    "page_id",
    "viewport",
    "stratum",
    "condition",
    "sc",
    "focus_index",
    "type",
    "bbox",
    "page_features",
]


def _row(r: UnitResult, kind: str, bbox: Any, features: dict[str, Any]) -> dict[str, Any]:
    return {
        "page_id": r.page_id,
        "viewport": r.viewport,
        "stratum": r.stratum,
        "condition": r.condition,
        "sc": r.sc,
        "focus_index": "" if r.key is None else r.key,
        "type": kind,
        "bbox": "" if bbox is None else json.dumps(bbox.model_dump()),
        "page_features": json.dumps(features, sort_keys=True),
    }


def write_failures(
    path: Path, results: list[UnitResult], features: dict[str, dict[str, Any]]
) -> int:
    rows: list[dict[str, Any]] = []
    for r in results:
        feats = features.get(r.page_id, {})
        for box in r.fp_boxes:
            rows.append(_row(r, "FP", box, feats))
        for box in r.fn_boxes:
            rows.append(_row(r, "FN", box, feats))
        if r.key is not None and r.fp:
            rows.append(_row(r, "FP", None, feats))
        if r.key is not None and r.fn:
            rows.append(_row(r, "FN", None, feats))
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)
