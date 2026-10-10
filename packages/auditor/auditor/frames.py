from __future__ import annotations

from dataclasses import dataclass

from auditor.schema import BBox, Capture, FocusStep


@dataclass(frozen=True)
class Frame:
    """Transforms between CSS px, PNG px and document px for one focus stop.

    Focus rects are viewport-relative CSS px; focus PNGs are viewport images drawn at
    `png_scale`; the document frame adds the scroll offset. Full-page screenshots are 1:1.
    """

    png_scale: float = 1.0
    scroll_x: float = 0.0
    scroll_y: float = 0.0

    @classmethod
    def for_step(cls, step: FocusStep) -> Frame:
        return cls(
            png_scale=step.png_scale or 1.0,
            scroll_x=step.scroll.get("x", 0.0),
            scroll_y=step.scroll.get("y", 0.0),
        )

    @classmethod
    def full_page(cls) -> Frame:
        return cls()

    def css_to_png(self, box: BBox) -> BBox:
        s = self.png_scale
        return BBox(x=box.x * s, y=box.y * s, w=box.w * s, h=box.h * s)

    def png_to_css(self, box: BBox) -> BBox:
        s = self.png_scale
        return BBox(x=box.x / s, y=box.y / s, w=box.w / s, h=box.h / s)

    def viewport_to_document(self, box: BBox) -> BBox:
        return BBox(x=box.x + self.scroll_x, y=box.y + self.scroll_y, w=box.w, h=box.h)

    def document_to_viewport(self, box: BBox) -> BBox:
        return BBox(x=box.x - self.scroll_x, y=box.y - self.scroll_y, w=box.w, h=box.h)

    def png_to_document(self, box: BBox) -> BBox:
        return self.viewport_to_document(self.png_to_css(box))

    def document_to_png(self, box: BBox) -> BBox:
        return self.css_to_png(self.document_to_viewport(box))

    def length_to_css(self, png_length: float) -> float:
        return png_length / self.png_scale

    def area_to_css(self, png_area: float) -> float:
        return png_area / (self.png_scale**2)

    def crop_box(self, rect: BBox, pad: float = 0.0) -> tuple[int, int, int, int]:
        """PNG-px crop (x0, y0, x1, y1) around a viewport CSS rect; pad is in CSS px."""
        s = self.png_scale
        return (
            max(0, int((rect.x - pad) * s)),
            max(0, int((rect.y - pad) * s)),
            int((rect.x + rect.w + pad) * s),
            int((rect.y + rect.h + pad) * s),
        )  # int() truncation mirrors sa_tools.crop_for so crops are comparable


def frames_for(capture: Capture) -> list[Frame]:
    return [Frame.for_step(s) for s in capture.focus_steps]
