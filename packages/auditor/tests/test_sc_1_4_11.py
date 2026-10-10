from typing import Any

import numpy as np
from _modhelp import WHITE, canvas, ctx, element
from auditor.modules import sc_1_4_11
from auditor.schema import Finding


def field(border: tuple[int, int, int] | None, fill: tuple[int, int, int] = WHITE) -> np.ndarray:
    img = canvas(500, 200)
    x0, y0, x1, y1 = 80, 60, 400, 100
    img[y0:y1, x0:x1] = fill
    if border is not None:
        img[y0, x0:x1] = border
        img[y1 - 1, x0:x1] = border
        img[y0:y1, x0] = border
        img[y0:y1, x1 - 1] = border
    return img


BOX = (80, 60, 320, 40)


def run(img: np.ndarray, kind: str = "input", **kw: Any) -> list[Finding]:
    return sc_1_4_11.run(ctx(img, [element(kind, *BOX, dom_ref="input#a", **kw)]))


def test_border_below_three_to_one_fails() -> None:
    (f,) = run(field((0xCC, 0xCC, 0xCC)))
    assert f.sc == "1.4.11" and f.tier == "automated"
    assert f.evidence["border_ratio"] == 1.6 and f.evidence["fill_ratio"] == 1.0
    assert f.severity == "serious"


def test_border_at_or_above_three_to_one_passes() -> None:
    assert run(field((0x94, 0x94, 0x94))) == []


def test_every_failure_is_serious_because_the_protocol_defines_no_narrow_band_for_non_text() -> (
    None
):
    (f,) = run(field((0x97, 0x97, 0x97)))
    assert f.evidence["ratio"] < 3.0 and f.severity == "serious"


def test_fill_can_identify_the_control_instead_of_the_border() -> None:
    assert run(field(None, fill=(0x33, 0x33, 0x33))) == []


def test_no_border_and_white_fill_fails() -> None:
    (f,) = run(field(None))
    assert f.evidence["ratio"] == 1.0


def test_disabled_and_unstyled_native_controls_are_exempt() -> None:
    img = field((0xEE, 0xEE, 0xEE))
    assert run(img, is_disabled=True) == []
    assert run(img, is_native=True, style={"unstyled_native": True}) == []
    assert len(run(img, is_native=True, style={"unstyled_native": False})) == 1


def test_buttons_and_links_with_visible_labels_are_not_evaluated() -> None:
    img = field((0xEE, 0xEE, 0xEE))
    assert run(img, kind="button", text="Send") == [] and run(img, kind="link", text="Home") == []


def test_icon_only_control_below_three_to_one_is_flagged_for_review() -> None:
    img = canvas(500, 200)
    img[70:90, 100:120] = (0xDD, 0xDD, 0xDD)
    (f,) = sc_1_4_11.run(ctx(img, [element("button", 90, 60, 40, 40, dom_ref="button#i")]))
    assert f.tier == "needs-review" and f.severity == "serious"
    assert f.evidence["method"] == "icon-only (O2)" and f.evidence["ratio"] < 3.0


def test_icon_only_control_with_a_strong_icon_passes() -> None:
    img = canvas(500, 200)
    img[70:90, 100:120] = (0x22, 0x22, 0x22)
    assert sc_1_4_11.run(ctx(img, [element("button", 90, 60, 40, 40)])) == []


def test_checkbox_kind_is_evaluated() -> None:
    assert len(run(field((0xEE, 0xEE, 0xEE)), kind="choice")) == 1


def test_controls_at_the_page_edge_are_measured_from_the_sides_that_exist() -> None:
    img = canvas(200, 100)
    edge = element("input", 0, 0, 100, 30)
    (f,) = sc_1_4_11.run(ctx(img, [edge]))
    assert f.evidence["ratio"] == 1.0
    img[0:30, 0:100] = (0xFF, 0xFF, 0xFF)
    img[29, 0:100] = img[0:30, 99] = (0x22, 0x22, 0x22)
    assert sc_1_4_11.run(ctx(img, [edge])) == []


def test_boxes_extending_past_the_canvas_are_skipped() -> None:
    img = canvas(200, 100)
    assert sc_1_4_11.run(ctx(img, [element("input", 150, 10, 100, 30)])) == []


def test_rounded_corners_do_not_change_the_measured_border() -> None:
    img = field((0xCC, 0xCC, 0xCC))
    for dx, dy in ((0, 0), (1, 0), (0, 1)):
        img[60 + dy, 80 + dx] = (0xF0, 0xF0, 0xF0)
    (f,) = run(img)
    assert f.evidence["border"] == "#CCCCCC"


def test_a_border_anti_aliased_across_two_rows_is_still_found() -> None:
    img = field(None)
    img[60, 80:400] = (0x99, 0x99, 0x99)
    img[61, 80:400] = (0xCC, 0xCC, 0xCC)
    img[99, 80:400] = (0x99, 0x99, 0x99)
    img[98, 80:400] = (0xCC, 0xCC, 0xCC)
    img[60:100, 80] = img[60:100, 399] = (0x99, 0x99, 0x99)
    (f,) = run(img)
    assert f.evidence["border"] == "#999999" and f.evidence["border_ratio"] < 3.0


def test_a_two_pixel_border_is_measured() -> None:
    img = field(None)
    for off in range(2):
        img[60 + off, 80:400] = img[99 - off, 80:400] = (0xCC, 0xCC, 0xCC)
        img[60:100, 80 + off] = img[60:100, 399 - off] = (0xCC, 0xCC, 0xCC)
    (f,) = run(img)
    assert f.evidence["border"] == "#CCCCCC"


def test_a_coloured_page_background_is_the_comparison_colour() -> None:
    img = canvas(500, 200, color=(0x20, 0x20, 0x20))
    img[60:100, 80:400] = (0x20, 0x20, 0x20)
    img[60, 80:400] = img[99, 80:400] = (0x50, 0x50, 0x50)
    img[60:100, 80] = img[60:100, 399] = (0x50, 0x50, 0x50)
    (f,) = run(img)
    assert f.evidence["outside"] == "#202020" and f.evidence["border_ratio"] < 3.0


def test_a_real_corner_radius_does_not_disturb_the_border_reading() -> None:
    img = field((0xCC, 0xCC, 0xCC))
    radius = 6
    for dy in range(radius):
        for dx in range(radius):
            if (radius - dx - 0.5) ** 2 + (radius - dy - 0.5) ** 2 > radius**2:
                for x, y in (
                    (80 + dx, 60 + dy),
                    (399 - dx, 60 + dy),
                    (80 + dx, 99 - dy),
                    (399 - dx, 99 - dy),
                ):
                    img[y, x] = WHITE
    (f,) = run(img)
    assert f.evidence["border"] == "#CCCCCC"


def test_sliders_and_images_are_not_evaluated() -> None:
    img = field((0xEE, 0xEE, 0xEE))
    assert run(img, kind="slider") == [] and run(img, kind="image_icon") == []


def test_tiny_boxes_are_skipped() -> None:
    img = canvas(100, 100)
    assert sc_1_4_11.run(ctx(img, [element("input", 50, 50, 3, 3)])) == []


def test_severity_is_serious_on_both_sides_of_the_old_2_7_cutoff() -> None:
    assert run(field((0xDD, 0xDD, 0xDD)))[0].severity == "serious"
    assert run(field((0x99, 0x99, 0x99)))[0].severity == "serious"
