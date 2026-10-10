from __future__ import annotations

import hashlib
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict

PROTOCOL_PATH = Path(__file__).with_name("protocol.yaml")


class _Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Contrast(_Frozen):
    text: float
    large_text: float
    non_text: float


class LargeText(_Frozen):
    min_px: float
    min_px_bold: float
    bold_weight: int


class FocusThresholds(_Frozen):
    visibility_ratio: float
    ring_min_px: float
    ring_min_contrast: float
    area_factor: float


class Match(_Frozen):
    iou: float
    containment: float


class Thresholds(_Frozen):
    contrast: Contrast
    large_text: LargeText
    target_size_px: float
    focus: FocusThresholds
    match: Match


class Heuristics(_Frozen):
    focus_changed_pixel_delta: int
    focus_unsettled_fraction: float
    focus_obscured_sample_points: int
    contrast_window_px: int
    edge_gradient_threshold: int
    ring_outside_gap_px: int
    ring_corner_skip_px: int
    ring_inset_px: int
    focus_pad_px: int
    ring_side_margin_fraction: float
    slider_widget_depth: int
    ua_focus_ring_rgb: list[int]
    ua_ring_min_share: float
    ua_default_ring_exempt: bool
    ocr_tile_height_px: int
    ocr_tile_overlap_px: int
    ocr_large_ink_height_px: int
    detector_score_threshold: float
    detector_nms_iou: float
    detector_tile_overlap_px: int


class ContrastSeverity(_Frozen):
    serious_below: float
    serious_below_large: float


class SeverityRule(_Frozen):
    id: str
    applies_to: list[str]
    level: str
    note: str | None = None


class Severity(_Frozen):
    contrast: ContrastSeverity
    levels: list[str]
    rules: list[SeverityRule]


class Flag(BaseModel):
    model_config = ConfigDict(frozen=True, extra="allow")

    summary: str
    enabled: bool


class Protocol(_Frozen):
    protocol_version: str
    thresholds: Thresholds
    heuristics: Heuristics
    severity: Severity
    tiers: list[str]
    scs: list[str]
    page_scs: list[str]
    focus_scs: list[str]
    rulings: dict[str, Flag]
    observations: dict[str, Flag]


def _read(path: Path) -> bytes:
    return path.read_bytes()


@lru_cache(maxsize=4)
def _load(path: Path) -> Protocol:
    data: dict[str, Any] = yaml.safe_load(_read(path))
    return Protocol.model_validate(data)


def default_path() -> Path:
    """The packaged protocol.yaml, or the file named by AUDITOR_PROTOCOL (parameter sweeps)."""
    override = os.environ.get("AUDITOR_PROTOCOL")
    return Path(override) if override else PROTOCOL_PATH


def load(path: Path | None = None) -> Protocol:
    return _load(path or default_path())


def sha256(path: Path | None = None) -> str:
    return hashlib.sha256(_read(path or default_path())).hexdigest()
