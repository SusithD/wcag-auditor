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


def focus_ctx(
    on: np.ndarray,
    off: np.ndarray,
    rect: tuple[float, float, float, float] = (60, 60, 120, 40),
    scroll: tuple[float, float] = (0, 0),
    scale: float = 1.0,
    elements: list[Element] | None = None,
    has_geometry: bool = False,
) -> ModuleContext:
    from auditor.modules.context import FocusPair
    from auditor.schema import FocusStep

    step = FocusStep(
        index=0,
        file_on="on.png",
        file_off="off.png",
        uid=1,
        tag="button",
        selector="button#x",
        rect=BBox(x=rect[0], y=rect[1], w=rect[2], h=rect[3]),
        scroll={"x": scroll[0], "y": scroll[1]},
        png_scale=scale,
    )
    cap = capture().model_copy(update={"focus_steps": [step]})
    return ModuleContext(
        cap,
        elements or [],
        canvas(),
        protocol.load(),
        focus={0: FocusPair(step, on, off)},
        has_geometry=has_geometry,
    )


def draw_ring(
    img: np.ndarray,
    rect: tuple[int, int, int, int],
    color: tuple[int, int, int],
    thickness: int,
    offset: int = 2,
    sides: tuple[str, ...] = ("top", "bottom", "left", "right"),
) -> None:
    x, y, w, h = rect
    x0, y0 = max(0, x - offset - thickness), max(0, y - offset - thickness)
    x1, y1 = x + w + offset + thickness, y + h + offset + thickness
    if "top" in sides:
        img[y0 : y0 + thickness, x0:x1] = color
    if "bottom" in sides:
        img[y1 - thickness : y1, x0:x1] = color
    if "left" in sides:
        img[y0:y1, x0 : x0 + thickness] = color
    if "right" in sides:
        img[y0:y1, x1 - thickness : x1] = color


def grey_for_ratio(target: float) -> tuple[int, int, int]:
    """Darkest-first grey on white whose ratio is just at or above `target`."""
    from auditor.modules.color import contrast_ratio

    for v in range(255, -1, -1):
        if contrast_ratio((v, v, v), WHITE) >= target:
            return (v, v, v)
    return (0, 0, 0)
