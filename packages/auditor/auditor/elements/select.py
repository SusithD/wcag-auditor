from __future__ import annotations

from typing import Any

from auditor.elements.base import Element
from auditor.elements.dom import DomElementSource, geometry_source
from auditor.elements.pixel import PixelElementSource
from auditor.schema import Capture

ELEMENT_MODES = ("auto", "dom", "detector")


def source_name(capture: Capture) -> str:
    """ADR-012: stored or re-renderable DOM geometry when it exists, otherwise pixels."""
    return "pixel" if geometry_source(capture) == "unavailable" else "dom"


class CombinedPixelSource:
    """OCR text lines plus detector boxes for links, buttons, inputs, choices and icons."""

    def __init__(self, ocr: PixelElementSource, detector: Any = None) -> None:
        self.ocr = ocr
        self.detector = detector

    def elements(self, capture: Capture) -> list[Element]:
        found = self.ocr.elements(capture)
        if self.detector is not None:
            found += self.detector.elements(capture)
        return sorted(found, key=lambda e: (e.bbox_css.y, e.bbox_css.x))


class SourceSelector:
    """Picks the element source per capture and shares the heavy resources between captures.

    auto: ADR-012 selection, with the detector added to the pixel source when a model exists.
    dom: stored or re-rendered DOM only (ablation baseline).
    detector: OCR plus detector boxes for every capture, even where the DOM is available.
    """

    def __init__(self, mode: str = "auto") -> None:
        if mode not in ELEMENT_MODES:
            raise ValueError(f"elements mode must be one of {ELEMENT_MODES}")
        self.mode = mode
        self.ocr = PixelElementSource()
        self.pixel: Any = self.ocr
        self.detector_loaded = False
        if mode != "dom":
            from auditor.elements.detector import DetectorElementSource, model_path

            path = model_path()
            if path is not None:
                self.pixel = CombinedPixelSource(self.ocr, DetectorElementSource(path))
                self.detector_loaded = True
            elif mode == "detector":
                raise FileNotFoundError("--elements detector needs a trained detector model")
        self.dom = DomElementSource().__enter__()

    def for_capture(self, capture: Capture) -> tuple[str, Any]:
        if self.mode == "detector":
            return "pixel", self.pixel
        if self.mode == "dom":
            return "dom", self.dom
        name = source_name(capture)
        return name, (self.pixel if name == "pixel" else self.dom)

    def close(self) -> None:
        self.dom.close()
