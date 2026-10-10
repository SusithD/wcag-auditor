import json
from pathlib import Path

import pytest
from auditor.schema import BBox, Capture, Finding, Truth
from pydantic import ValidationError

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"


def finding(**kw: object) -> Finding:
    base: dict[str, object] = {
        "sc": "1.4.3",
        "bbox": BBox(x=0, y=0, w=10, h=10),
        "severity": "serious",
        "tier": "automated",
        "score": 0.9,
        "provenance": "pixel",
        "guidance_key": "1.4.3/contrast",
    }
    return Finding.model_validate({**base, **kw})


def test_page_sc_needs_bbox() -> None:
    with pytest.raises(ValidationError):
        finding(bbox=None)


def test_focus_sc_needs_focus_index() -> None:
    with pytest.raises(ValidationError):
        finding(sc="2.4.7", bbox=None)
    assert finding(sc="2.4.7", bbox=None, focus_index=3).focus_index == 3


def test_not_assessable_may_be_unlocated() -> None:
    assert finding(sc="2.5.7", bbox=None, tier="not-assessable").bbox is None


def test_score_range() -> None:
    with pytest.raises(ValidationError):
        finding(score=1.5)


@pytest.mark.parametrize("meta", sorted(FIXTURES.glob("**/meta.json")), ids=lambda p: p.parent.name)
def test_fixture_captures_and_truth_parse(meta: Path) -> None:
    folder = meta.parent
    capture = Capture.from_folder(folder)
    assert len(capture.focus_steps) == capture.meta["focus_step_count"]
    truth = Truth.model_validate(json.loads((folder / "truth.json").read_text()))
    assert truth.page_id and (truth.annotations or truth.focus_judgments or "synth" in folder.name)


def test_non_responsive_mobile_fixture_keeps_png_scale() -> None:
    folder = next(FIXTURES.glob("real/real_com_011_mobile_*"))
    capture = Capture.from_folder(folder)
    assert capture.viewport == "mobile"
    assert {s.png_scale for s in capture.focus_steps} == {0.398}
    assert capture.layout is not None and capture.layout.has_meta_viewport is False


def test_fixture_glob_finds_twelve() -> None:
    assert len(list(FIXTURES.glob("**/meta.json"))) == 12
