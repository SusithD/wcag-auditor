from __future__ import annotations

from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field

from auditor.schema import BBox, Capture

ElementKind = Literal[
    "text",
    "link",
    "button",
    "input",
    "choice",
    "slider",
    "image_icon",
    "fixed_region",
    "sticky_region",
]


class Element(BaseModel):
    """One measurable unit; `bbox_css` is in document CSS px (PLAN §4.2)."""

    kind: ElementKind
    bbox_css: BBox
    text: str | None = None
    style: dict[str, Any] = Field(default_factory=dict)
    dom_ref: str | None = None
    is_native: bool = False
    is_disabled: bool = False


class ElementSource(Protocol):
    def elements(self, capture: Capture) -> list[Element]: ...
