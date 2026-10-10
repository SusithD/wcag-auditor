import json
from pathlib import Path

import pytest
from auditor.frames import Frame
from auditor.modules import MODULES, ModuleContext
from auditor.modules.focus_common import analyse
from auditor.protocol import load
from auditor.schema import Capture

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"


def real_mobile() -> Capture:
    return Capture.from_folder(next(FIXTURES.glob("real/real_com_011_mobile_*")))


def test_non_responsive_mobile_fixture_areas_are_computed_in_css_px() -> None:
    capture = real_mobile()
    ctx = ModuleContext.load(capture, [], has_geometry=False)
    checked = 0
    for step in capture.focus_steps:
        diff = analyse(ctx, step)
        if diff is None:
            continue
        assert diff.scale == 0.398 and Frame.for_step(step).png_scale == 0.398
        px = int(diff.changed.sum())
        assert Frame.for_step(step).area_to_css(px) == pytest.approx(px / 0.398**2)
        x0, y0, x1, y1 = diff.rect_png
        assert (x1 - x0) == pytest.approx(step.rect.w * 0.398, abs=1.5)
        checked += 1
    assert checked >= 5


def test_non_responsive_mobile_findings_report_css_px_areas() -> None:
    capture = real_mobile()
    ctx = ModuleContext.load(capture, [], has_geometry=False)
    findings = MODULES["2.4.13"](ctx)
    assert findings
    for f in findings:
        assert f.evidence["png_scale"] == 0.398
        step = next(s for s in capture.focus_steps if s.index == f.focus_index)
        assert f.evidence["required_area_css"] == pytest.approx(
            4 * (step.rect.w + step.rect.h), abs=0.1
        )


def test_r5_fixture_two_pixel_ring_below_the_area_requirement_meets() -> None:
    from auditor.modules import sc_2_4_13

    folder = next(FIXTURES.glob("synth/sc2-4-13/*_092_*"))
    capture = Capture.from_folder(folder)
    step = capture.focus_steps[0]
    assert json.loads((folder / "truth.json").read_text())["annotations"] == []
    ctx = ModuleContext.load(capture, [], has_geometry=False)
    assert MODULES["2.4.13"](ctx) == []
    diff = analyse(ctx, step)
    assert diff is not None and diff.added_px > 0
    strong = diff.added & (diff.ratio >= 3.0)
    area = float(strong.sum())
    required = 4 * (step.rect.w + step.rect.h)
    assert 0.9 * required < area < required
    sides = sc_2_4_13._sides(diff, strong, 2.0, 4, 0.25)
    assert all(s["complete"] and s["judged"] for s in sides.values())
    assert all(s["thickness_px"] == 2.0 for s in sides.values())


def test_o4_fixture_violation_is_reported_with_its_evidence() -> None:
    folder = next(FIXTURES.glob("synth/sc2-4-13/*_091_*"))
    capture = Capture.from_folder(folder)
    (f,) = MODULES["2.4.13"](ModuleContext.load(capture, [], has_geometry=False))
    assert f.focus_index == 0 and f.evidence["strong_area_css"] == 0.0
    assert f.evidence["rule"] == "R5 then O4"


def test_unstyled_default_ring_is_exempt_and_evaluated_when_the_switch_is_off() -> None:
    folder = next(FIXTURES.glob("synth/sc2-4-7/*_047_*"))
    capture = Capture.from_folder(folder)
    proto = load()
    off = proto.model_copy(
        update={"heuristics": proto.heuristics.model_copy(update={"ua_default_ring_exempt": False})}
    )
    exempt = ModuleContext.load(capture, [], has_geometry=False)
    strict = ModuleContext.load(capture, [], protocol=off, has_geometry=False)
    assert MODULES["2.4.13"](exempt) == []
    assert len(MODULES["2.4.13"](strict)) == 1
    assert MODULES["2.4.7"](exempt) == []
