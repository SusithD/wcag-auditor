import json
import os
import shutil
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from _modhelp import canvas
from auditor import protocol
from auditor.elements.base import Element
from auditor.elements.pixel import (
    PixelElementSource,
    dedupe,
    ink_extent,
    polygon_box,
    seam_bands,
    tile_ranges,
)
from auditor.elements.select import source_name
from auditor.eval.harness import EvalConfig, PixelPredictor
from auditor.eval.match import match_boxes
from auditor.geometry import containment
from auditor.modules import sc_1_4_3
from auditor.modules.context import ModuleContext
from auditor.schema import BBox, Capture
from PIL import Image

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
BENCH = Path(
    os.environ.get(
        "BENCHMARK_DIR",
        Path(__file__).resolve().parents[3].parent / "04_Data_Collection" / "benchmark_captures",
    )
)


def line(x: float, y: float, w: float, h: float, text: str = "t") -> Element:
    return Element(kind="text", bbox_css=BBox(x=x, y=y, w=w, h=h), text=text)


def test_short_pages_are_a_single_tile() -> None:
    assert tile_ranges(900, 2000, 64) == [(0, 900)]
    assert tile_ranges(2000, 2000, 64) == [(0, 2000)]


def test_tall_pages_are_cut_into_overlapping_strips_that_cover_every_row() -> None:
    ranges = tile_ranges(4083, 2000, 64)
    assert ranges == [(0, 2000), (1936, 3936), (3872, 4083)]
    assert all(b - a <= 2000 for a, b in ranges)
    assert all(ranges[i][1] - ranges[i + 1][0] == 64 for i in range(len(ranges) - 1))
    assert ranges[0][0] == 0 and ranges[-1][1] == 4083


def test_polygon_box_is_the_axis_aligned_hull() -> None:
    box = polygon_box([[10, 5], [60, 6], [59, 25], [11, 24]])
    assert (box.x, box.y, box.w, box.h) == (10, 5, 50, 20)


def test_seam_bands_cover_the_shared_rows_plus_a_margin() -> None:
    assert seam_bands([(0, 2000), (1936, 3936), (3872, 4083)], 64) == [(1872, 2064), (3808, 4000)]


def test_duplicate_detections_from_overlapping_tiles_are_merged_keeping_the_uncut_line() -> None:
    full = line(10, 1950, 200, 20, "full")
    cut = line(10, 1950, 200, 8, "cut")
    shifted = line(11, 1951, 198, 20, "again")
    kept = dedupe([cut, full, shifted], 0.3, 0.5)
    assert [e.text for e in kept] == ["full"]


def test_dedupe_only_compares_boxes_that_touch_a_seam() -> None:
    a, b = line(10, 100, 200, 20, "a"), line(11, 101, 198, 20, "b")
    assert len(dedupe([a, b], 0.3, 0.5, bands=[(1872, 2064)])) == 2
    assert len(dedupe([a, b], 0.3, 0.5, bands=None)) == 1


def test_neighbouring_lines_are_not_merged() -> None:
    a, b = line(10, 100, 300, 18), line(10, 122, 300, 18)
    assert len(dedupe([a, b], 0.3, 0.5)) == 2


def test_selection_follows_adr_012() -> None:
    synth = Capture.from_folder(min(FIXTURES.glob("synth/sc1-4-3/*")))
    real = Capture.from_folder(min(FIXTURES.glob("real/real_com_003_desktop_*")))
    assert source_name(synth) == "dom" and source_name(real) == "pixel"


def test_a_capture_with_stored_geometry_prefers_the_dom(tmp_path: Path) -> None:
    real = min(FIXTURES.glob("real/real_com_003_desktop_*"))
    dest = tmp_path / real.name
    shutil.copytree(real, dest)
    (dest / "elements.json").write_text(json.dumps({"geometry_source": "capture", "elements": []}))
    assert source_name(Capture.from_folder(dest)) == "dom"


class FakeEngine:
    """Strip 1: a line and one cut at the seam. Strip 2: the cut line whole, plus another."""

    def __init__(self) -> None:
        self.calls: list[tuple[int, int]] = []

    def __call__(self, image: np.ndarray) -> tuple[list[Any], None]:
        self.calls.append(image.shape[:2])
        h = image.shape[0]
        if len(self.calls) == 1:
            cut = [[10, 1975], [200, 1975], [200, h], [10, h]]
            top = [[10, 100], [200, 100], [200, 120], [10, 120]]
            return [(cut, "cut", 0.8), (top, "top", 0.9)], None
        full = [[10, 30], [200, 30], [200, 70], [10, 70]]
        end = [[10, h - 30], [200, h - 30], [200, h - 10], [10, h - 10]]
        return [(full, "full", 0.95), (end, "end", 0.9)], None


def source_for(
    tmp_path: Path, height: int, engine: Callable[..., Any], mode: str = "RGB"
) -> PixelElementSource:
    Image.fromarray(canvas(300, height)).convert(mode).save(tmp_path / "screenshot.png")
    return PixelElementSource(engine=engine)


def capture_in(tmp_path: Path) -> Capture:
    base = Capture.from_folder(min(FIXTURES.glob("synth/sc1-4-3/*")))
    return base.model_copy(update={"path": tmp_path})


def test_boxes_are_converted_per_strip_and_a_line_cut_at_the_seam_keeps_its_full_version(
    tmp_path: Path,
) -> None:
    engine = FakeEngine()
    lines = source_for(tmp_path, 3000, engine).elements(capture_in(tmp_path))
    assert engine.calls == [(2000, 300), (1064, 300)]
    by_text = {e.text: e for e in lines}
    assert set(by_text) == {"top", "full", "end"}
    assert round(by_text["full"].bbox_css.y) == 1936 + 30
    assert round(by_text["full"].bbox_css.h) == 40
    assert round(by_text["end"].bbox_css.y) == 1936 + 1064 - 30
    assert round(by_text["top"].bbox_css.y) == 100


def test_nested_text_away_from_a_seam_is_never_merged(tmp_path: Path) -> None:
    def nested(image: np.ndarray) -> tuple[list[Any], None]:
        outer = [[10, 100], [210, 100], [210, 140], [10, 140]]
        inner = [[20, 105], [100, 105], [100, 125], [20, 125]]
        return [(outer, "label", 0.9), (inner, "badge", 0.9)], None

    lines = source_for(tmp_path, 900, nested).elements(capture_in(tmp_path))
    assert sorted(e.text or "" for e in lines) == ["badge", "label"]


def test_empty_or_missing_ocr_output_yields_no_lines(tmp_path: Path) -> None:
    def none_result(image: np.ndarray) -> tuple[None, None]:
        return None, None

    def empty_result(image: np.ndarray) -> tuple[list[Any], None]:
        return [], None

    for engine in (none_result, empty_result):
        assert source_for(tmp_path, 400, engine).elements(capture_in(tmp_path)) == []


@pytest.mark.parametrize("mode", ["L", "RGBA", "P"])
def test_grayscale_palette_and_alpha_screenshots_are_read(tmp_path: Path, mode: str) -> None:
    engine = FakeEngine()
    lines = source_for(tmp_path, 500, engine, mode=mode).elements(capture_in(tmp_path))
    assert lines and len(engine.calls[0]) == 2


def test_ink_height_measures_the_glyphs_not_the_padded_box() -> None:
    crop = canvas(120, 60)
    crop[22:40, 10:100] = (0, 0, 0)
    assert ink_extent(crop, 24) == 18
    assert ink_extent(canvas(40, 40), 24) == 0 and ink_extent(canvas(0, 0), 24) == 0


@pytest.mark.parametrize(("ink", "large"), [(31, None), (32, True)])
def test_the_ink_height_boundary_for_large_text(ink: int, large: bool | None) -> None:
    img = canvas()
    img[40:60, 22:298] = (0x99, 0x99, 0x99)
    el = Element(kind="text", bbox_css=BBox(x=20, y=20, w=280, h=60), style={"ink_height_px": ink})
    capture = Capture.from_folder(min(FIXTURES.glob("synth/sc1-4-3/*")))
    (f,) = sc_1_4_3.run(ModuleContext(capture, [el], img, protocol.load()))
    assert f.evidence["large_text"] is large
    assert f.tier == ("automated" if large else "needs-review")


def test_a_corrupt_stored_geometry_falls_back_to_the_pixel_source(tmp_path: Path) -> None:
    real = min(FIXTURES.glob("real/real_com_003_desktop_*"))
    dest = tmp_path / "bench" / real.name
    shutil.copytree(real, dest)
    (dest / "elements.json").write_text("{not json")
    predictor = PixelPredictor(EvalConfig(benchmark=tmp_path, out=tmp_path / "o"))
    try:
        predictor.predict(Capture.from_folder(dest))
    finally:
        predictor.close()
    assert predictor.source_counts == {"dom": 0, "pixel": 1}


def test_ocr_reads_the_synthetic_fixture_text_inside_the_truth_block() -> None:
    capture = Capture.from_folder(min(FIXTURES.glob("synth/sc1-4-3/*")))
    lines = PixelElementSource().elements(capture)
    box = BBox.model_validate(
        json.loads((capture.path / "truth.json").read_text())["annotations"][0]["bbox"]
    )
    inside = [e for e in lines if containment(e.bbox_css, box) >= 0.9]
    assert any("password" in (e.text or "").lower() for e in inside)
    assert all(e.style["ink_height_px"] <= e.style["box_height_px"] for e in lines)


@pytest.mark.parametrize("name", ["real_com_003_desktop", "real_com_011_mobile"])
def test_a_real_page_is_read_within_the_runtime_budget(name: str) -> None:
    capture = Capture.from_folder(min(FIXTURES.glob(f"real/{name}_*")))
    src = PixelElementSource()
    started = time.perf_counter()
    src.elements(capture)
    cold = time.perf_counter() - started
    started = time.perf_counter()
    lines = src.elements(capture)
    warm = time.perf_counter() - started
    assert cold < 20 and warm < 20 and len(lines) > 10


@pytest.mark.browser
def test_every_synthetic_truth_block_is_matched_by_an_ocr_line_on_the_corpus() -> None:
    if not BENCH.is_dir():
        if os.environ.get("REQUIRE_BENCHMARK") == "1":
            pytest.fail("benchmark captures not available")
        pytest.skip("benchmark captures not available")
    m = protocol.load().thresholds.match
    src = PixelElementSource()
    found = total = 0
    for folder in sorted(BENCH.glob("synth_sc1-4-3_*_desktop_*")):
        lines = [e.bbox_css for e in src.elements(Capture.from_folder(folder))]
        truth = [
            BBox.model_validate(a["bbox"])
            for a in json.loads((folder / "truth.json").read_text())["annotations"]
        ]
        result = match_boxes(lines, truth, m.iou, m.containment)
        found += result.tp
        total += len(truth)
    assert total == 15 and found == total


def test_real_fixtures_1_4_3_with_pixel_lines_is_a_measurement_with_a_loose_floor() -> None:
    m = protocol.load().thresholds.match
    src = PixelElementSource()
    totals = {"tp": 0, "fp": 0, "fn": 0}
    for folder in sorted(FIXTURES.glob("real/*")):
        capture = Capture.from_folder(folder)
        truth = [
            BBox.model_validate(a["bbox"])
            for a in json.loads((folder / "truth.json").read_text())["annotations"]
            if a["sc"] == "1.4.3"
        ]
        elements = src.elements(capture)
        findings = sc_1_4_3.run(ModuleContext.load(capture, elements, load_focus=False))
        r = match_boxes([f.bbox for f in findings if f.bbox], truth, m.iou, m.containment)
        totals["tp"] += r.tp
        totals["fp"] += r.fp
        totals["fn"] += r.fn
    assert totals["tp"] + totals["fn"] == 10 and totals["tp"] >= 8
