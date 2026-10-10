from __future__ import annotations

from typing import Any

from auditor.elements.dom import DomElementSource, geometry_source
from auditor.elements.pixel import PixelElementSource
from auditor.schema import Capture


def source_name(capture: Capture) -> str:
    """ADR-012: stored or re-renderable DOM geometry when it exists, otherwise pixels."""
    return "pixel" if geometry_source(capture) == "unavailable" else "dom"


class SourceSelector:
    """Picks the element source per capture and shares the heavy resources between captures."""

    def __init__(self) -> None:
        self.dom = DomElementSource().__enter__()
        self.pixel = PixelElementSource()

    def for_capture(self, capture: Capture) -> tuple[str, Any]:
        name = source_name(capture)
        return name, (self.pixel if name == "pixel" else self.dom)

    def close(self) -> None:
        self.dom.close()
