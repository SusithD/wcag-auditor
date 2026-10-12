from __future__ import annotations

import csv
import json
import math
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import Settings

CLASS_ORDER = ("text", "link", "button", "input", "choice", "image_icon")
Z95 = 1.96
LENSES = (
    ("geometry", "geometry", "Is it one complete element with a tight box?"),
    ("class", "class_ok", "Is the class label right for what is in the box?"),
    (
        "box_and_class",
        "correct_geometry_and_class",
        "Are the box and the class both correct?",
    ),
    ("strict", "strict", "Is it usable as ground truth for a contrast or size check?"),
)
REVIEWER = "AI-assisted review by six independent reviewer agents; no human rater"


class ClassAp(BaseModel):
    name: str
    ap_50_95: float


class LabelNoiseLens(BaseModel):
    lens: str
    question: str
    correct: int
    noise_rate: float
    ci_half_width: float


class LabelNoiseClass(BaseModel):
    name: str
    boxes: int


class LabelNoise(BaseModel):
    sample_size: int
    reviewer: str
    lenses: list[LabelNoiseLens]
    sample_classes: list[LabelNoiseClass]


class DetectorEval(BaseModel):
    images: int
    ground_truth_boxes: int
    map_50_95: float
    map_50: float
    map_75: float
    mar_100: float
    per_class: list[ClassAp]
    onnx_sha256: str | None
    manifest_sha256: str | None
    label_noise: LabelNoise | None


def _read_json(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _flag(row: dict[str, str], key: str) -> int | None:
    value = (row.get(key) or "").strip()
    return int(value) if value in {"0", "1"} else None


def read_label_noise(path: Path) -> LabelNoise | None:
    try:
        with path.open(newline="") as handle:
            rows = list(csv.DictReader(handle))
    except OSError:
        return None
    if not rows:
        return None
    n = len(rows)
    lenses: list[LabelNoiseLens] = []
    for lens, column, question in LENSES:
        flags = [_flag(r, column) for r in rows]
        if any(f is None for f in flags):
            return None
        correct = sum(f or 0 for f in flags)
        rate = 1 - correct / n
        lenses.append(
            LabelNoiseLens(
                lens=lens,
                question=question,
                correct=correct,
                noise_rate=rate,
                ci_half_width=Z95 * math.sqrt(rate * (1 - rate) / n),
            )
        )
    counts: dict[str, int] = {}
    for r in rows:
        name = r.get("class") or ""
        counts[name] = counts.get(name, 0) + 1
    ordered = sorted(counts, key=lambda k: (-counts[k], k))
    return LabelNoise(
        sample_size=n,
        reviewer=REVIEWER,
        lenses=lenses,
        sample_classes=[LabelNoiseClass(name=k, boxes=counts[k]) for k in ordered],
    )


def read_detector_eval(directory: Path) -> DetectorEval | None:
    raw = _read_json(directory / "onnx_validation.json")
    if raw is None:
        return None
    try:
        per_class = raw["per_class_AP_50_95"]
        known = [k for k in CLASS_ORDER if k in per_class]
        extra = sorted(k for k in per_class if k not in CLASS_ORDER)
        return DetectorEval(
            images=int(raw["images"]),
            ground_truth_boxes=int(raw["ground_truth_boxes"]),
            map_50_95=float(raw["mAP_50_95"]),
            map_50=float(raw["mAP_50"]),
            map_75=float(raw["mAP_75"]),
            mar_100=float(raw["mAR_100"]),
            per_class=[ClassAp(name=k, ap_50_95=float(per_class[k])) for k in known + extra],
            onnx_sha256=raw.get("onnx_sha256"),
            manifest_sha256=raw.get("manifest_sha256"),
            label_noise=read_label_noise(directory / "label_noise" / "label_noise_checked.csv"),
        )
    except (KeyError, TypeError, ValueError):
        return None


def build_detector_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/eval/detector", response_model=DetectorEval)
    def detector_eval() -> DetectorEval:
        result = read_detector_eval(settings.detector_eval_path)
        if result is None:
            raise HTTPException(404, "No detector evaluation is available")
        return result

    return router
