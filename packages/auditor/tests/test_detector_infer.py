from pathlib import Path
from typing import Any

import numpy as np
import pytest
from _modhelp import canvas
from auditor.detector.infer import Detection, Detector, nms, postprocess, preprocess, tile_grid
from auditor.elements.base import Element
from auditor.elements.detector import DetectorElementSource
from auditor.elements.pixel import PixelElementSource
from auditor.elements.select import CombinedPixelSource, SourceSelector
from auditor.schema import BBox, Capture

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
NAMES = ["text", "link", "button", "input", "choice", "image_icon"]


def box(x: float, y: float, w: float, h: float) -> BBox:
    return BBox(x=x, y=y, w=w, h=h)


def test_preprocess_squashes_normalises_and_orders_channels_first() -> None:
    tile = np.full((90, 160, 3), 255, dtype=np.uint8)
    out = preprocess(tile, 64)
    assert out.shape == (1, 3, 64, 64) and out.dtype == np.float32
    assert out[0, 0, 0, 0] == pytest.approx((1 - 0.485) / 0.229, rel=1e-4)


def test_postprocess_converts_normalised_boxes_and_applies_the_score_threshold() -> None:
    boxes = np.array([[0.5, 0.5, 0.2, 0.1], [0.5, 0.5, 0.2, 0.1], [0.05, 0.05, 0.2, 0.2]])
    logits = np.full((3, 6), -10.0)
    logits[0, 2] = 4.0
    logits[1, 2] = -3.0
    logits[2, 1] = 4.0
    dets = postprocess(boxes, logits, (200, 400), NAMES, 0.3)
    assert [d.cls for d in dets] == ["button", "link"]
    first = dets[0].bbox
    assert (first.x, first.y, first.w, first.h) == pytest.approx((160, 90, 80, 20))
    clipped = dets[1].bbox
    assert clipped.x == 0 and clipped.y == 0
    assert clipped.w == pytest.approx(60) and clipped.h == pytest.approx(30)


def test_postprocess_drops_boxes_that_lie_outside_the_tile() -> None:
    boxes = np.array([[0.5, 1.4, 0.2, 0.1], [-0.3, 0.5, 0.2, 0.1], [1.2, 0.5, 0.2, 0.1]])
    logits = np.full((3, 6), 4.0)
    assert postprocess(boxes, logits, (200, 400), NAMES, 0.3) == []


def test_nms_merges_same_class_duplicates_but_not_other_classes() -> None:
    a = Detection("link", 0.9, box(10, 10, 100, 20))
    b = Detection("link", 0.6, box(12, 11, 100, 20))
    c = Detection("button", 0.5, box(10, 10, 100, 20))
    kept = nms([b, a, c], 0.5)
    assert sorted((d.cls, d.score) for d in kept) == [("button", 0.5), ("link", 0.9)]


def test_tile_grid_covers_every_pixel_with_the_viewport_sized_tiles() -> None:
    tiles = tile_grid((2300, 1500), (900, 1440), 64)
    cover = np.zeros((2300, 1500), dtype=bool)
    for x0, y0, x1, y1 in tiles:
        assert x1 - x0 <= 1440 and y1 - y0 <= 900
        cover[y0:y1, x0:x1] = True
    assert cover.all() and len(tiles) == 6
    assert tile_grid((500, 300), (900, 1440), 64) == [(0, 0, 300, 500)]


class FakeSession:
    def __init__(self) -> None:
        self.shapes: list[tuple[int, ...]] = []

    def get_inputs(self) -> list[Any]:
        return [type("I", (), {"name": "input"})()]

    def run(self, _outputs: Any, feed: dict[str, np.ndarray]) -> list[np.ndarray]:
        self.shapes.append(feed["input"].shape)
        boxes = np.array([[[0.25, 0.25, 0.2, 0.2]]], dtype=np.float32)
        logits = np.full((1, 1, 7), -10.0, dtype=np.float32)
        logits[0, 0, 1] = 5.0
        logits[0, 0, 6] = 9.0
        return [boxes, logits]


def test_detector_runs_per_tile_and_reports_document_px() -> None:
    session = FakeSession()
    detector = Detector(Path("unused.onnx"), resolution=32, session=session)
    assert detector.names == NAMES
    image = canvas(300, 200)
    found = detector.detect(image, (100, 150))
    assert session.shapes and all(s == (1, 3, 32, 32) for s in session.shapes)
    assert {d.cls for d in found} == {"link"}
    assert len(found) == len(tile_grid((200, 300), (100, 150), 64))
    assert any(d.bbox.x > 0 and d.bbox.y > 0 for d in found)


class FakeDetector:
    def detect(self, image: np.ndarray, tile: tuple[int, int]) -> list[Detection]:
        return [
            Detection("button", 0.8, box(10, 10, 80, 30)),
            Detection("text", 0.9, box(10, 60, 80, 20)),
            Detection("image_icon", 0.7, box(100, 10, 20, 20)),
        ]


def real_capture() -> Capture:
    return Capture.from_folder(next(FIXTURES.glob("real/real_com_003_desktop_*")))


def test_detector_source_keeps_non_text_classes_and_records_scores() -> None:
    elements = DetectorElementSource(detector=FakeDetector()).elements(real_capture())
    assert [e.kind for e in elements] == ["button", "image_icon"]
    assert elements[0].style["source"] == "detector" and elements[0].style["detector_score"] == 0.8


def test_combined_source_adds_detector_boxes_to_the_ocr_lines() -> None:
    class FakeOcr(PixelElementSource):
        def elements(self, capture: Capture) -> list[Element]:
            return [Element(kind="text", bbox_css=box(5, 5, 50, 12), text="hi")]

    combined = CombinedPixelSource(FakeOcr(), DetectorElementSource(detector=FakeDetector()))
    kinds = [e.kind for e in combined.elements(real_capture())]
    assert sorted(kinds) == ["button", "image_icon", "text"]


def test_selector_modes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setenv("AUDITOR_DETECTOR", str(tmp_path / "missing.onnx"))
    with pytest.raises(FileNotFoundError):
        SourceSelector("detector")
    with pytest.raises(ValueError):
        SourceSelector("nonsense")
    auto = SourceSelector("auto")
    forced = SourceSelector("dom")
    try:
        real = real_capture()
        assert auto.for_capture(real)[0] == "pixel" and not auto.detector_loaded
        assert forced.for_capture(real)[0] == "dom"
    finally:
        auto.close()
        forced.close()
