from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from auditor import protocol as protocol_mod
from auditor.detector import classmap
from auditor.elements.pixel import tile_ranges
from auditor.geometry import iou
from auditor.schema import BBox

RESOLUTION = 576
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


@dataclass(frozen=True)
class Detection:
    cls: str
    score: float
    bbox: BBox


def preprocess(tile: np.ndarray, resolution: int) -> np.ndarray:
    """Squash a tile to resolution x resolution, scale to 0-1, normalise, NCHW float32."""
    resized = Image.fromarray(tile).resize((resolution, resolution), Image.Resampling.BILINEAR)
    arr = (np.asarray(resized, dtype=np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
    return np.ascontiguousarray(arr.transpose(2, 0, 1)[None])


def sigmoid(x: np.ndarray) -> np.ndarray:
    return np.asarray(1.0 / (1.0 + np.exp(-x)))


def postprocess(
    boxes: np.ndarray,
    logits: np.ndarray,
    tile_size: tuple[int, int],
    names: list[str],
    score_threshold: float,
) -> list[Detection]:
    """Normalised (cx, cy, w, h) boxes and per-class logits -> detections in tile pixels."""
    height, width = tile_size
    scores = sigmoid(logits)
    cls_idx = scores.argmax(axis=1)
    best = scores.max(axis=1)
    out: list[Detection] = []
    for (cx, cy, w, h), k, s in zip(boxes, cls_idx, best, strict=True):
        if s < score_threshold or k >= len(names):
            continue
        x0, y0 = (cx - w / 2) * width, (cy - h / 2) * height
        left, top = max(0.0, float(x0)), max(0.0, float(y0))
        box_w = min(float(width), float(x0 + w * width)) - left
        box_h = min(float(height), float(y0 + h * height)) - top
        if box_w > 0 and box_h > 0:
            out.append(Detection(names[int(k)], float(s), BBox(x=left, y=top, w=box_w, h=box_h)))
    return out


def nms(detections: list[Detection], iou_threshold: float) -> list[Detection]:
    """Greedy per-class non-maximum suppression (also merges duplicates from tile overlaps)."""
    kept: list[Detection] = []
    for det in sorted(detections, key=lambda d: -d.score):
        if not any(k.cls == det.cls and iou(k.bbox, det.bbox) >= iou_threshold for k in kept):
            kept.append(det)
    return kept


def tile_grid(
    size: tuple[int, int], tile: tuple[int, int], overlap: int
) -> list[tuple[int, int, int, int]]:
    """(x0, y0, x1, y1) tiles of at most tile width x height, overlapping by `overlap` px."""
    height, width = size
    cols = tile_ranges(width, tile[1], overlap)
    rows = tile_ranges(height, tile[0], overlap)
    return [(x0, y0, x1, y1) for y0, y1 in rows for x0, x1 in cols]


class Detector:
    """RF-DETR exported to ONNX, run on CPU with onnxruntime (the shipped inference path)."""

    def __init__(self, onnx_path: Path, resolution: int = RESOLUTION, session: Any = None) -> None:
        self.resolution = resolution
        self.names = classmap.classes()
        if session is None:
            import onnxruntime as ort

            session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
        self.session = session
        self.input_name = session.get_inputs()[0].name

    def _run(self, tile: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        outputs = self.session.run(None, {self.input_name: preprocess(tile, self.resolution)})
        boxes = next(o for o in outputs if o.shape[-1] == 4)[0]
        logits = next(o for o in outputs if o.shape[-1] != 4)[0]
        return boxes, logits[:, : len(self.names)]

    def detect(self, image: np.ndarray, tile: tuple[int, int]) -> list[Detection]:
        """Detections in document px for a full-page screenshot, tiled at the viewport size."""
        h = protocol_mod.load().heuristics
        found: list[Detection] = []
        for x0, y0, x1, y1 in tile_grid(image.shape[:2], tile, h.detector_tile_overlap_px):
            crop = image[y0:y1, x0:x1]
            boxes, logits = self._run(crop)
            for d in postprocess(
                boxes, logits, crop.shape[:2], self.names, h.detector_score_threshold
            ):
                b = d.bbox
                found.append(Detection(d.cls, d.score, BBox(x=b.x + x0, y=b.y + y0, w=b.w, h=b.h)))
        return nms(found, h.detector_nms_iou)
