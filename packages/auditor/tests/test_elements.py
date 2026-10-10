import json
from collections import Counter
from pathlib import Path
from typing import Any

import pytest
from auditor.elements.base import Element
from auditor.elements.dom import DomElementSource
from auditor.features import compute
from auditor.schema import Capture

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
GOLDEN = FIXTURES / "golden" / "elements"
FOLDERS = sorted(p.parent for p in FIXTURES.glob("**/meta.json") if "golden" not in p.parts)


def test_golden_exists_for_every_fixture() -> None:
    assert len(FOLDERS) == 5
    assert {f"{f.name}.json" for f in FOLDERS} == {p.name for p in GOLDEN.glob("*.json")}


def _close(a: Any, b: Any, tol: float = 1.0) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return bool(a == b)
    if isinstance(a, int | float) and isinstance(b, int | float):
        return abs(a - b) <= tol
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(_close(a[k], b[k], tol) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(_close(x, y, tol) for x, y in zip(a, b, strict=True))
    return bool(a == b)


EXPECTED_KINDS = {
    "real_com_003_desktop": {
        "link": 22,
        "input": 1,
        "button": 2,
        "text": 39,
        "image_icon": 2,
        "fixed_region": 1,
    },
    "real_com_011_mobile": {"link": 18, "input": 1, "button": 1, "text": 38, "image_icon": 10},
    "synth_sc1-4-3_001": {"text": 2},
    "synth_sc2-4-13_091": {"button": 1, "text": 4},
    "synth_sc2-5-8_126": {"button": 4, "text": 7},
}


@pytest.mark.parametrize("folder", FOLDERS, ids=lambda p: p.name)
def test_golden_content_is_valid_and_counts_are_pinned(folder: Path) -> None:
    golden = json.loads((GOLDEN / f"{folder.name}.json").read_text())
    elements = [Element.model_validate(e) for e in golden["elements"]]
    counts = Counter(e.kind for e in elements)
    key = next(k for k in EXPECTED_KINDS if folder.name.startswith(k))
    assert dict(counts) == EXPECTED_KINDS[key]
    assert all(e.bbox_css.w > 0 and e.bbox_css.h > 0 for e in elements)


@pytest.mark.browser
@pytest.mark.parametrize("folder", FOLDERS, ids=lambda p: p.name)
def test_element_dump_matches_golden(folder: Path) -> None:
    capture = Capture.from_folder(folder)
    elements = DomElementSource().elements(capture)
    got = {
        "features": compute(capture, elements).model_dump(),
        "elements": [e.model_dump(mode="json") for e in elements],
    }
    want = json.loads((GOLDEN / f"{folder.name}.json").read_text())
    assert _close(json.loads(json.dumps(got, sort_keys=True)), want)


@pytest.mark.browser
def test_synthetic_boxes_match_capture_and_truth() -> None:
    folder = next(FIXTURES.glob("synth/sc2-5-8/*"))
    capture = Capture.from_folder(folder)
    truth = json.loads((folder / "truth.json").read_text())
    buttons = [e for e in DomElementSource().elements(capture) if e.kind == "button"]
    boxes = sorted((e.bbox_css.x, e.bbox_css.y, e.bbox_css.w, e.bbox_css.h) for e in buttons)
    focus = sorted(
        (s.rect.x + s.scroll["x"], s.rect.y + s.scroll["y"], s.rect.w, s.rect.h)
        for s in capture.focus_steps
    )
    assert boxes == pytest.approx(focus)
    for ann in truth["test_elements"]:
        b = ann["bbox"]
        assert (b["x"], b["y"], b["w"], b["h"]) in [tuple(x) for x in boxes] or any(
            (b["x"], b["y"], b["w"], b["h"]) == pytest.approx(x) for x in boxes
        )


@pytest.mark.browser
def test_element_kinds_on_real_desktop_fixture() -> None:
    capture = Capture.from_folder(next(FIXTURES.glob("real/real_com_003_desktop_*")))
    kinds = {e.kind for e in DomElementSource().elements(capture)}
    assert {"link", "input", "button", "text", "image_icon", "fixed_region"} <= kinds


INLINE = """<!doctype html><html><head><style>
body{margin:0;height:3000px}
.sticky{position:sticky;top:0;background:rgba(0,0,0,0.5);height:40px}
.fixed{position:fixed;bottom:0;left:0;width:200px;height:30px;background:#fff}
.styled{border:2px solid red;background:#eee}
.pct{position:fixed;top:0;right:0;width:20px;height:20px;background:rgb(0 0 0 / 50%)}
</style></head><body>
<div class="sticky">bar</div>
<div class="fixed">cookie</div>
<button id="plain">Plain</button>
<button id="styled" class="styled">Styled</button>
<button id="off" disabled>Off</button>
<input id="submit" type="submit" value="Go">
<input id="pw" type="password" value="hunter2">
<div class="pct"></div>
<input id="range" type="range">
<div id="role-slider" role="slider" tabindex="0" style="width:100px;height:10px">s</div>
<a href="#x" id="link">link</a>
</body></html>"""


@pytest.mark.browser
def test_inline_page_flags_and_regions(tmp_path: Path) -> None:
    src = next(FIXTURES.glob("synth/sc2-5-8/*"))
    (tmp_path / "dom.html").write_text(INLINE)
    (tmp_path / "meta.json").write_text((src / "meta.json").read_text())
    elements = DomElementSource().elements(Capture.from_folder(tmp_path))
    by_ref = {e.dom_ref: e for e in elements if e.kind != "text"}

    assert by_ref["button#plain"].is_native and by_ref["button#plain"].style["unstyled_native"]
    assert by_ref["button#styled"].style["unstyled_native"] is False
    assert by_ref["button#off"].is_disabled and not by_ref["button#plain"].is_disabled
    assert by_ref["input#range"].kind == "slider" and by_ref["input#range"].is_native
    slider = by_ref["div#role-slider"]
    assert slider.kind == "slider" and not slider.is_native
    assert by_ref["a#link"].kind == "link"
    assert by_ref["input#submit"].kind == "button"
    assert by_ref["input#pw"].kind == "input" and by_ref["input#pw"].text is None
    pct = next(e for e in elements if (e.dom_ref or "").endswith("div.pct"))
    assert pct.style["alpha"] == pytest.approx(0.5)

    sticky = next(e for e in elements if e.kind == "sticky_region")
    fixed = next(e for e in elements if e.kind == "fixed_region")
    assert sticky.style["alpha"] == pytest.approx(0.5)
    assert fixed.style["alpha"] == pytest.approx(1.0)
    assert (fixed.bbox_css.x, fixed.bbox_css.w, fixed.bbox_css.h) == (0, 200, 30)
