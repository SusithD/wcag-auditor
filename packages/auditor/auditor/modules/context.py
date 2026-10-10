from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from auditor import protocol as protocol_mod
from auditor.elements.base import Element
from auditor.frames import Frame
from auditor.protocol import Protocol
from auditor.schema import Capture


@dataclass(frozen=True)
class ModuleContext:
    """Inputs for a pure module: the capture, its elements and the full-page pixels."""

    capture: Capture
    elements: list[Element]
    image: np.ndarray
    protocol: Protocol
    frame: Frame = field(default_factory=Frame.full_page)

    @classmethod
    def load(
        cls, capture: Capture, elements: list[Element], protocol: Protocol | None = None
    ) -> ModuleContext:
        with Image.open(capture.path / "screenshot.png") as shot:
            image = np.asarray(shot.convert("RGB"))
        return cls(capture, elements, image, protocol or protocol_mod.load())

    def crop(self, x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
        h, w = self.image.shape[:2]
        left, top = max(0, int(np.floor(x0))), max(0, int(np.floor(y0)))
        right, bottom = min(w, int(np.ceil(x1))), min(h, int(np.ceil(y1)))
        return self.image[top:bottom, left:right]
