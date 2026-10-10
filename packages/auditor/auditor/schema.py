from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

SC = Literal["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]
FOCUS_SCS: frozenset[str] = frozenset({"2.4.7", "2.4.11", "2.4.12", "2.4.13"})
Severity = Literal["critical", "serious", "minor"]
Tier = Literal["automated", "needs-review", "not-assessable"]
Provenance = Literal["rule", "pixel", "both"]
Condition = Literal["hybrid", "rule_only"]
Viewport = Literal["desktop", "mobile"]
SourceKind = Literal["url", "upload", "folder"]
RunStatus = Literal["queued", "running", "done", "failed", "cancelled"]
FindingStatus = Literal["open", "fixed", "ignored"]


class BBox(BaseModel):
    model_config = ConfigDict(frozen=True, allow_inf_nan=False)

    x: float
    y: float
    w: float = Field(ge=0)
    h: float = Field(ge=0)


class Finding(BaseModel):
    sc: SC
    bbox: BBox | None = None
    focus_index: int | None = None
    severity: Severity
    tier: Tier
    score: float = Field(ge=0.0, le=1.0)
    provenance: Provenance
    evidence: dict[str, Any] = Field(default_factory=dict)
    guidance_key: str

    @model_validator(mode="after")
    def _located(self) -> Self:
        if self.tier == "not-assessable":
            return self
        if self.sc in FOCUS_SCS and self.focus_index is None:
            raise ValueError(f"SC {self.sc} is keyed by focus_index")
        if self.sc not in FOCUS_SCS and self.bbox is None:
            raise ValueError(f"SC {self.sc} requires a bbox in document CSS px")
        return self


class ViewportSpec(BaseModel):
    model_config = ConfigDict(extra="allow")

    width: int
    height: int
    is_mobile: bool
    has_touch: bool
    device_scale_factor: float = 1


class FocusStep(BaseModel):
    model_config = ConfigDict(extra="allow")

    index: int
    file_on: str
    file_off: str
    uid: int | None = None
    tag: str | None = None
    role: str | None = None
    name: str | None = None
    selector: str | None = None
    rect: BBox
    scroll: dict[str, float]
    png_scale: float


class Layout(BaseModel):
    model_config = ConfigDict(extra="allow")

    has_meta_viewport: bool
    layout_width: float
    scroll_width: float
    inner_width: float
    visual_viewport_scale: float


class PageFeatures(BaseModel):
    edge_density: float | None = None
    element_density: float | None = None
    focus_stop_count: int | None = None
    has_sticky: bool | None = None
    is_non_responsive: bool | None = None


class Capture(BaseModel):
    """A capture folder (capture_and_select.py layout) with its meta.json parsed."""

    model_config = ConfigDict(extra="allow")

    path: Path
    viewport: Viewport
    meta: dict[str, Any]
    viewport_spec: ViewportSpec
    focus_steps: list[FocusStep] = Field(default_factory=list)
    layout: Layout | None = None
    page_features: PageFeatures = Field(default_factory=PageFeatures)

    @classmethod
    def from_folder(cls, folder: Path) -> Capture:
        meta = json.loads((folder / "meta.json").read_text())
        return cls(
            path=folder,
            viewport=meta["viewport"],
            meta=meta,
            viewport_spec=ViewportSpec.model_validate(meta["viewport_spec"]),
            focus_steps=[FocusStep.model_validate(s) for s in meta.get("focus_steps", [])],
            layout=Layout.model_validate(meta["layout"]) if "layout" in meta else None,
        )


Verdict = Literal["automated", "needs-review", "not-assessable", "none"]


class CoverageCell(BaseModel):
    viewport: Viewport
    sc: SC
    rule_verdict: Verdict
    pixel_verdict: Verdict
    hybrid_verdict: Verdict


class Coverage(BaseModel):
    cells: list[CoverageCell] = Field(default_factory=list)

    def reliable(self, channel: Literal["rule", "pixel", "hybrid"]) -> int:
        scs = {c.sc for c in self.cells}
        reliable = {c.sc for c in self.cells if getattr(c, f"{channel}_verdict") == "automated"}
        return len(reliable & scs)


class Run(BaseModel):
    id: str
    created_at: datetime
    source_kind: SourceKind
    source: str
    viewports: list[Viewport]
    condition: Condition
    status: RunStatus
    stage_status: dict[str, str] = Field(default_factory=dict)
    versions: dict[str, str | None] = Field(default_factory=dict)
    protocol_sha: str
    error: str | None = None
    findings: list[Finding] = Field(default_factory=list)
    coverage: Coverage = Field(default_factory=Coverage)


class TruthAnnotation(BaseModel):
    model_config = ConfigDict(extra="allow")

    sc: SC
    bbox: BBox
    severity: Severity
    source: str | None = None
    note: str | None = None
    confidence: str | None = None
    boundary: bool | None = None
    element_id: str | None = None


class FocusJudgment(BaseModel):
    index: int
    v247: Literal["yes", "no", "not-assessable"]
    obs: Literal["none", "partial", "entire"]
    v2413: Literal["meets", "fails", "na", "not-assessable"]


class Truth(BaseModel):
    """truth.json shape: synthetic generator output and extracted real ground-truth items."""

    model_config = ConfigDict(extra="allow")

    page_id: str
    viewport: Viewport
    annotations: list[TruthAnnotation] = Field(default_factory=list)
    focus_judgments: list[FocusJudgment] = Field(default_factory=list)
