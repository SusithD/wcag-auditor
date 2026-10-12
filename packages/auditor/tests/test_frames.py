import importlib.util
import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest
from auditor.frames import Frame, frames_for
from auditor.schema import BBox, Capture

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "fixtures"
SA_TOOLS = REPO.parent / "04_Data_Collection" / "annotation" / "sa_tools.py"


def mobile_capture() -> Capture:
    return Capture.from_folder(min(FIXTURES.glob("real/real_com_011_mobile_*")))


def load_sa_tools() -> Any:
    if not SA_TOOLS.exists():
        if os.environ.get("REQUIRE_BENCHMARK") == "1":
            pytest.fail("sa_tools.py not available")
        pytest.skip("sa_tools.py not available")
    spec = importlib.util.spec_from_file_location("sa_tools", SA_TOOLS)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, ["sa_tools"]
    try:
        spec.loader.exec_module(module)
    finally:
        sys.argv = argv
    return module


@pytest.mark.parametrize("scale", [1.0, 0.5, 0.398])
@pytest.mark.parametrize(
    "rect", [(372, 74, 96, 40), (-1, 0, 1, 1), (10, 10, 0, 0)], ids=["normal", "negative-x", "zero"]
)
def test_css_png_round_trip(scale: float, rect: tuple[float, float, float, float]) -> None:
    frame = Frame(png_scale=scale)
    box = BBox(x=rect[0], y=rect[1], w=rect[2], h=rect[3])
    back = frame.png_to_css(frame.css_to_png(box))
    assert (back.x, back.y, back.w, back.h) == pytest.approx(rect)


def test_missing_png_scale_falls_back_to_one() -> None:
    step = mobile_capture().focus_steps[0].model_copy(update={"png_scale": 0})
    assert Frame.for_step(step).png_scale == 1.0


def test_area_to_css_zero() -> None:
    assert Frame(png_scale=0.398).area_to_css(0) == 0


def test_viewport_document_round_trip() -> None:
    frame = Frame(png_scale=1.0, scroll_x=10, scroll_y=300)
    box = BBox(x=5, y=6, w=7, h=8)
    doc = frame.viewport_to_document(box)
    assert (doc.x, doc.y) == (15, 306)
    assert frame.document_to_viewport(doc) == box


def test_lengths_scale_by_png_scale_and_areas_by_its_square() -> None:
    frame = Frame(png_scale=0.5)
    assert frame.length_to_css(10) == 20
    assert frame.area_to_css(10) == 40


def test_png_to_document_combines_scale_and_scroll() -> None:
    frame = Frame(png_scale=0.5, scroll_y=100)
    out = frame.png_to_document(BBox(x=10, y=10, w=20, h=20))
    assert (out.x, out.y, out.w, out.h) == (20, 120, 40, 40)


def test_mobile_fixture_frames_use_png_scale() -> None:
    capture = mobile_capture()
    assert {f.png_scale for f in frames_for(capture)} == {0.398}


def test_scrolled_mobile_stops_map_to_document_px() -> None:
    scrolled = [s for s in mobile_capture().focus_steps if s.scroll["y"] > 0]
    assert scrolled
    for step in scrolled:
        frame = Frame.for_step(step)
        doc = frame.png_to_document(frame.css_to_png(step.rect))
        assert (doc.x, doc.y, doc.w, doc.h) == pytest.approx(
            (
                step.rect.x + step.scroll["x"],
                step.rect.y + step.scroll["y"],
                step.rect.w,
                step.rect.h,
            ),
            abs=1,
        )


def test_crop_box_matches_vendored_sa_tools_vectors() -> None:
    vectors = json.loads((FIXTURES / "vectors" / "crop_for_mobile.json").read_text())["vectors"]
    steps = {s.index: s for s in mobile_capture().focus_steps}
    assert len(vectors) == len(steps) == 15
    for vec in vectors:
        step = steps[vec["index"]]
        got = Frame.for_step(step).crop_box(step.rect, pad=vec["pad"])
        assert all(abs(a - b) <= 1 for a, b in zip(got, vec["crop_for"], strict=True)), vec


def test_crop_box_matches_live_sa_tools_crop_for() -> None:
    sa_tools = load_sa_tools()
    capture = mobile_capture()
    assert capture.focus_steps
    for step in capture.focus_steps:
        expected, scale = sa_tools.crop_for(None, step.model_dump(), pad=60)
        got = Frame.for_step(step).crop_box(step.rect, pad=60)
        assert scale == step.png_scale
        assert all(abs(a - b) <= 1 for a, b in zip(got, expected, strict=True)), (got, expected)
