import json

import numpy as np
import pytest
from _modhelp import FIXTURES, WHITE, canvas, ctx, element, text_on
from auditor.elements.dom import DomElementSource
from auditor.modules import sc_1_4_3
from auditor.modules.context import ModuleContext
from auditor.schema import Capture, Finding

BOX = (20, 20, 300, 30)


def run(fg: tuple[int, int, int], **style: object) -> list[Finding]:
    img = canvas()
    el = text_on(img, fg, BOX, **style)
    return sc_1_4_3.run(ctx(img, [el]))


def test_ratio_just_below_normal_threshold_fails_as_minor() -> None:
    (f,) = run((0x77, 0x77, 0x77))
    assert f.evidence["ratio"] == 4.47 and f.evidence["threshold"] == 4.5
    assert (f.severity, f.tier, f.sc) == ("minor", "automated", "1.4.3")


def test_ratio_at_or_above_threshold_passes() -> None:
    assert run((0x76, 0x76, 0x76)) == []


def test_below_serious_cutoff_is_serious() -> None:
    (f,) = run((0x99, 0x99, 0x99))
    assert f.severity == "serious" and f.evidence["ratio"] < 4.0


def test_large_text_uses_the_lower_threshold_and_severity_cutoff() -> None:
    grey = (0x94, 0x94, 0x94)
    assert run(grey, font_size_px=24, font_weight=400) == []
    (f,) = run(grey, font_size_px=14, font_weight=400)
    assert f.evidence["large_text"] is False
    (g,) = run((0x99, 0x99, 0x99), font_size_px=24)
    assert g.evidence["threshold"] == 3.0 and g.severity == "minor"


def test_bold_size_boundary_is_18_66_at_700_and_semibold_is_not_bold() -> None:
    grey = (0x94, 0x94, 0x94)
    assert run(grey, font_size_px=18.66, font_weight=700) == []
    assert run(grey, font_size_px=18.66, font_weight=600) != []
    assert run(grey, font_size_px=18.65, font_weight=700) != []


def test_gradient_uses_the_worst_window() -> None:
    img = canvas(700, 120)
    ramp = np.linspace(255, 70, 700).astype(np.uint8)
    img[:, :, 0] = img[:, :, 1] = img[:, :, 2] = ramp
    el = text_on(img, WHITE, (0, 30, 700, 40), font_size_px=22, font_weight=700)
    img[40:60, 2:698] = img[10:11, 2:698]
    (f,) = sc_1_4_3.run(ctx(img, [el]))
    assert f.evidence["worst_window_x"] < 100 and f.evidence["ratio"] < 1.5


def test_translucent_text_is_blended_over_the_background() -> None:
    img = canvas()
    el = text_on(img, (0, 0, 0), BOX, color="rgba(0, 0, 0, 0.3)")
    (f,) = sc_1_4_3.run(ctx(img, [el]))
    assert f.evidence["fg"] == "#B2B2B2" and f.severity == "serious"


def test_disabled_and_non_text_elements_are_ignored() -> None:
    img = canvas()
    off = text_on(img, (0xCC, 0xCC, 0xCC), BOX)
    off = off.model_copy(update={"is_disabled": True})
    btn = element("button", 20, 100, 80, 30, {})
    assert sc_1_4_3.run(ctx(img, [off, btn])) == []


def test_without_dom_style_the_pixel_path_marks_needs_review() -> None:
    img = canvas()
    el = text_on(img, (0xAA, 0xAA, 0xAA), BOX)
    el = el.model_copy(update={"style": {}})
    (f,) = sc_1_4_3.run(ctx(img, [el]))
    assert f.tier == "needs-review" and f.evidence["method"] == "pixel"
    assert "size and weight unknown" in f.evidence["needs_review_reason"]
    assert f.evidence["large_text"] is None and f.evidence["threshold"] == 4.5


def test_pixel_path_does_not_flag_a_passing_colour() -> None:
    img = canvas()
    el = text_on(img, (0x20, 0x20, 0x20), BOX).model_copy(update={"style": {}})
    assert sc_1_4_3.run(ctx(img, [el])) == []


def test_empty_or_off_canvas_boxes_are_skipped() -> None:
    img = canvas()
    off = element("text", 5000, 5000, 50, 20, {"color": "rgb(0, 0, 0)"})
    assert sc_1_4_3.run(ctx(img, [off])) == []


@pytest.mark.browser
def test_synthetic_fixture_finding_lies_inside_the_truth_block() -> None:
    folder = next(FIXTURES.glob("synth/sc1-4-3/*"))
    capture = Capture.from_folder(folder)
    truth = json.loads((folder / "truth.json").read_text())["annotations"][0]["bbox"]
    with DomElementSource() as source:
        elements = source.elements(capture)
    findings = sc_1_4_3.run(ModuleContext.load(capture, elements))
    assert len(findings) == 1
    box = findings[0].bbox
    assert box is not None
    assert truth["x"] <= box.x and box.x + box.w <= truth["x"] + truth["w"]
    assert truth["y"] <= box.y and box.y + box.h <= truth["y"] + truth["h"]


def test_glyph_dominated_window_does_not_yield_a_false_finding() -> None:
    img = canvas(120, 60)
    img[:, :] = (0x20, 0x20, 0x20)
    img[0:4, :] = WHITE
    el = element(
        "text", 0, 0, 120, 60, {"color": "rgb(32, 32, 32)", "font_size_px": 14, "font_weight": 400}
    )
    assert sc_1_4_3.run(ctx(img, [el])) == []


def test_null_or_nan_opacity_is_treated_as_opaque() -> None:
    for opacity in (None, float("nan")):
        (f,) = run((0x99, 0x99, 0x99), opacity=opacity)
        assert f.evidence["fg"] == "#999999"


def test_effective_opacity_lightens_the_foreground() -> None:
    (f,) = run((0, 0, 0), opacity=0.4)
    assert f.evidence["fg"] == "#999999"


def test_text_inside_svg_is_exempt_as_a_logotype() -> None:
    img = canvas()
    el = text_on(img, (0xCC, 0xCC, 0xCC), BOX, in_svg=True)
    assert sc_1_4_3.run(ctx(img, [el])) == []


def test_the_style_colour_governs_when_pixels_are_anti_aliased_lighter() -> None:
    img = canvas()
    el = text_on(img, (0x77, 0x77, 0x77), BOX)
    img[25:35, 22:318] = (0xB0, 0xB0, 0xB0)
    (f,) = sc_1_4_3.run(ctx(img, [el]))
    assert f.evidence["fg"] == "#777777" and f.evidence["ratio"] == 4.47


def test_only_the_far_window_failing_still_fails_and_reports_where() -> None:
    img = canvas(240, 60)
    img[:, 120:] = (0xB0, 0xB0, 0xB0)
    el = element(
        "text",
        0,
        10,
        240,
        40,
        {"color": "rgb(255, 255, 255)", "font_size_px": 14, "font_weight": 400},
    )
    img[25:35, 2:238] = (255, 255, 255)
    img[25:35, 2:118] = (255, 255, 255)
    img[:, 0:120] = (0x10, 0x10, 0x10)
    (f,) = sc_1_4_3.run(ctx(img, [el]))
    assert f.evidence["worst_window_x"] >= 120 and f.evidence["ratio"] < 4.5


def test_each_line_is_judged_on_its_own_background() -> None:
    img = canvas(300, 120)
    img[60:, :] = (0x30, 0x30, 0x30)
    top = text_on(img, (0x99, 0x99, 0x99), (10, 5, 280, 40))
    bottom = text_on(img, (0x99, 0x99, 0x99), (10, 65, 280, 40))
    findings = sc_1_4_3.run(ctx(img, [top, bottom]))
    assert len(findings) == 1 and findings[0].bbox is not None and findings[0].bbox.y == 5
