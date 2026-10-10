from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from PIL import Image

from auditor import protocol as protocol_mod
from auditor.elements.base import Element
from auditor.frames import Frame
from auditor.protocol import Protocol
from auditor.schema import Capture, FocusStep


@dataclass(frozen=True)
class FocusPair:
    """The focused and unfocused viewport images of one keyboard stop (focus_NNN / -off.png)."""

    step: FocusStep
    on: np.ndarray
    off: np.ndarray


@dataclass(frozen=True)
class ModuleContext:
    """Inputs for a pure module: the capture, its elements and the full-page pixels."""

    capture: Capture
    elements: list[Element]
    image: np.ndarray
    protocol: Protocol
    frame: Frame = field(default_factory=Frame.full_page)
    focus: dict[int, FocusPair] = field(default_factory=dict)
    has_geometry: bool = False
    cache: dict[object, object] = field(default_factory=dict, compare=False)

    @classmethod
    def load(
        cls,
        capture: Capture,
        elements: list[Element],
        protocol: Protocol | None = None,
        load_focus: bool = True,
        has_geometry: bool = False,
    ) -> ModuleContext:
        with Image.open(capture.path / "screenshot.png") as shot:
            image = np.asarray(shot.convert("RGB"))
        focus: dict[int, FocusPair] = {}
        if load_focus:
            for step in capture.focus_steps:
                on_path, off_path = capture.path / step.file_on, capture.path / step.file_off
                if on_path.is_file() and off_path.is_file():
                    with Image.open(on_path) as on, Image.open(off_path) as off:
                        focus[step.index] = FocusPair(
                            step, np.asarray(on.convert("RGB")), np.asarray(off.convert("RGB"))
                        )
        return cls(
            capture,
            elements,
            image,
            protocol or protocol_mod.load(),
            focus=focus,
            has_geometry=has_geometry,
        )

    def crop(self, x0: float, y0: float, x1: float, y1: float) -> np.ndarray:
        if not all(math.isfinite(v) for v in (x0, y0, x1, y1)):
            return self.image[0:0, 0:0]
        h, w = self.image.shape[:2]
        left, top = max(0, int(np.floor(x0))), max(0, int(np.floor(y0)))
        right, bottom = min(w, int(np.ceil(x1))), min(h, int(np.ceil(y1)))
        return self.image[top:bottom, left:right]
