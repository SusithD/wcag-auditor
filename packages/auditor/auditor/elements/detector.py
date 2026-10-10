from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from auditor.elements.base import Element
from auditor.schema import Capture

MODEL_ENV = "AUDITOR_DETECTOR"
DEFAULT_MODEL = Path("data/models/detector.onnx")
NON_TEXT = {"link", "button", "input", "choice", "image_icon"}


def model_path() -> Path | None:
    path = Path(os.environ.get(MODEL_ENV, DEFAULT_MODEL))
    return path if path.is_file() else None


class DetectorElementSource:
    """Interactive-element and icon boxes from the screenshot with the ONNX detector.

    Text lines are left to OCR (PixelElementSource); this source adds link, button, input,
    choice and image_icon boxes, in document CSS px, with the detector score as evidence.
    """

    def __init__(self, onnx_path: Path | None = None, detector: Any = None) -> None:
        if detector is None:
            from auditor.detector.infer import Detector

            detector = Detector(onnx_path or _require_model())
        self.detector = detector

    def elements(self, capture: Capture) -> list[Element]:
        spec = capture.viewport_spec
        with Image.open(capture.path / "screenshot.png") as shot:
            image = np.asarray(shot.convert("RGB"))
        out: list[Element] = []
        for d in self.detector.detect(image, (spec.height, spec.width)):
            if d.cls not in NON_TEXT:
                continue
            out.append(
                Element(
                    kind=d.cls,
                    bbox_css=d.bbox,
                    style={"detector_score": round(d.score, 3), "source": "detector"},
                )
            )
        return sorted(out, key=lambda e: (e.bbox_css.y, e.bbox_css.x))


def _require_model() -> Path:
    path = model_path()
    if path is None:
        raise FileNotFoundError(f"no detector model: set {MODEL_ENV} or place {DEFAULT_MODEL}")
    return path
