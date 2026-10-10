from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
from auditor import protocol
from auditor.elements.base import Element
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Capture

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
WHITE = (255, 255, 255)


def capture() -> Capture:
    return Capture.from_folder(next(FIXTURES.glob("synth/sc1-4-3/*")))


def canvas(w: int = 800, h: int = 300, color: tuple[int, int, int] = WHITE) -> np.ndarray:
    img = np.zeros((h, w, 3), dtype=np.uint8)
    img[:, :] = color
    return img


def ctx(image: np.ndarray, elements: list[Element]) -> ModuleContext:
    return ModuleContext(capture(), elements, image, protocol.load())


def rgb(c: tuple[int, int, int], alpha: float | None = None) -> str:
    return (
        f"rgb({c[0]}, {c[1]}, {c[2]})"
        if alpha is None
        else f"rgba({c[0]}, {c[1]}, {c[2]}, {alpha})"
    )


def element(
    kind: str,
    x: float,
    y: float,
    w: float,
    h: float,
    style: dict[str, Any] | None = None,
    **kw: Any,
) -> Element:
    return Element(kind=kind, bbox_css=BBox(x=x, y=y, w=w, h=h), style=style or {}, **kw)


def text_on(
    image: np.ndarray, fg: tuple[int, int, int], box: tuple[int, int, int, int], **style: Any
) -> Element:
    """Paint a solid glyph-like bar so the crop holds a foreground colour, return the element."""
    x, y, w, h = box
    image[y + h // 3 : y + 2 * h // 3, x + 2 : x + w - 2] = fg
    base = {"color": rgb(fg), "font_size_px": 14, "font_weight": 400, "opacity": 1.0}
    base.update(style)
    return element("text", x, y, w, h, base, text="sample", dom_ref="p")
