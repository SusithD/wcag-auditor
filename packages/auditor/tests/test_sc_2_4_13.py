from typing import Any

import numpy as np
from _modhelp import WHITE, canvas, draw_ring, focus_ctx, grey_for_ratio
from auditor.modules import sc_2_4_13
from auditor.schema import Finding

RECT = (60, 60, 120, 40)
RING = grey_for_ratio(3.1)
LOW = grey_for_ratio(2.6)


def views(img_w: int = 300, img_h: int = 200) -> tuple[np.ndarray, np.ndarray]:
    off = canvas(img_w, img_h)
    off[60:100, 60:180] = (0xF3, 0xF4, 0xF6)
    return off.copy(), off


def run(on: np.ndarray, off: np.ndarray, **kw: Any) -> list[Finding]:
    return sc_2_4_13.run(focus_ctx(on, off, kw.pop("rect", RECT), **kw))


def test_complete_two_pixel_ring_at_three_to_one_meets_even_below_the_area_requirement_r5() -> None:
    on, off = views()
    draw_ring(on, RECT, RING, 2)
    area = 2 * (2 * (120 + 40) + 4 * 2 + 8 * 2)
    assert area < 4 * (120 + 40) * 2
    assert run(on, off) == []


def test_one_pixel_solid_ring_fails_the_area_test_r4() -> None:
    on, off = views()
    draw_ring(on, RECT, RING, 1)
    (f,) = run(on, off)
    assert f.sc == "2.4.13" and f.severity == "minor" and f.tier == "automated"
    assert f.evidence["strong_area_css"] < f.evidence["required_area_css"]


def test_a_two_pixel_ring_just_below_three_to_one_fails() -> None:
    on, off = views()
    draw_ring(on, RECT, LOW, 2)
    (f,) = run(on, off)
    assert f.evidence["strong_area_css"] == 0.0


def test_a_ring_missing_a_side_falls_to_the_area_test_o4_and_fails() -> None:
    on, off = views()
    draw_ring(on, RECT, RING, 2, sides=("top", "left", "right"))
    (f,) = run(on, off)
    sides = f.evidence["ring_sides"]
    assert sides["bottom"]["complete"] is False and sides["top"]["complete"] is True


def test_a_colour_change_with_enough_strong_area_meets_o4() -> None:
    on, off = views()
    on[55:105, 55:185] = (0, 0, 0)
    assert run(on, off) == []


def test_a_colour_change_with_too_little_strong_area_fails_o4() -> None:
    on, off = views()
    on[70:76, 70:130] = (0, 0, 0)
    (f,) = run(on, off)
    assert f.evidence["strong_area_css"] < f.evidence["required_area_css"]


def test_no_visible_indicator_is_not_applicable_r1() -> None:
    on, off = views()
    draw_ring(on, RECT, (0xE5, 0xE7, 0xEB), 2)
    assert diff_max(on, off) < 1.5
    assert run(on, off) == []
    draw_ring(on, RECT, LOW, 1)
    assert diff_max(on, off) >= 1.5 and len(run(on, off)) == 1


def diff_max(on: np.ndarray, off: np.ndarray) -> float:
    from auditor.modules.focus_common import analyse

    ctx = focus_ctx(on, off, RECT)
    d = analyse(ctx, ctx.capture.focus_steps[0])
    assert d is not None
    return d.max_contrast() or 0.0


def test_a_clipped_one_pixel_ring_still_fails() -> None:
    rect = (60, 3, 120, 40)
    off = canvas(300, 200)
    off[3:43, 60:180] = (0xF3, 0xF4, 0xF6)
    on = off.copy()
    draw_ring(on, rect, RING, 1, offset=2)
    assert len(run(on, off, rect=rect)) == 1


def test_a_dotted_ring_is_not_a_complete_ring() -> None:
    on, off = views()
    draw_ring(on, RECT, RING, 2)
    on[56:60, 60:180:4] = WHITE
    on[56:60, 61:180:4] = WHITE
    on[56:60, 62:180:4] = WHITE
    (f,) = run(on, off)
    assert f.evidence["ring_sides"]["top"]["complete"] is False


def test_removed_pixels_do_not_count_as_an_added_indicator() -> None:
    off = canvas(300, 200)
    off[60:100, 60:180] = (0xF3, 0xF4, 0xF6)
    off[98:100, 60:180] = (0, 0, 0)
    on = off.copy()
    on[98:100, 60:180] = (0xF3, 0xF4, 0xF6)
    ctx = focus_ctx(on, off, RECT)
    from auditor.modules.focus_common import analyse

    d = analyse(ctx, ctx.capture.focus_steps[0])
    assert d is not None and d.changed_px > 0 and d.added_px == 0
    assert run(on, off) == []


def test_an_indicator_inside_the_box_is_judged_like_an_outside_one() -> None:
    off = canvas(300, 200)
    on = off.copy()
    draw_ring(on, RECT, RING, 2, offset=-1)
    assert run(on, off) == []


def test_a_rect_partly_outside_the_view_does_not_wrap_array_slices() -> None:
    off = canvas(300, 200)
    off[0:30, 0:100] = (0xF3, 0xF4, 0xF6)
    on = off.copy()
    on[0:30, 0:3] = RING
    assert len(run(on, off, rect=(-20, -20, 120, 50))) <= 1


def test_a_ring_clipped_by_the_view_edge_is_judged_on_what_is_visible_o1() -> None:
    rect = (60, 3, 120, 40)
    off = canvas(300, 200)
    off[3:43, 60:180] = (0xF3, 0xF4, 0xF6)
    on = off.copy()
    draw_ring(on, (60, 3, 120, 40), RING, 2, offset=2)
    f = run(on, off, rect=rect)
    assert f == []


def test_areas_are_measured_in_css_px_on_a_scaled_view() -> None:
    off = canvas(150, 100)
    off[30:50, 30:90] = (0xF3, 0xF4, 0xF6)
    on = off.copy()
    on[30:33, 30:50] = (0, 0, 0)
    (scaled,) = run(on, off, scale=0.5)
    full_off = canvas(300, 200)
    full_off[60:100, 60:180] = (0xF3, 0xF4, 0xF6)
    full_on = full_off.copy()
    full_on[60:66, 60:100] = (0, 0, 0)
    (full,) = run(full_on, full_off)
    assert scaled.evidence["strong_area_css"] == full.evidence["strong_area_css"] == 240.0


def test_two_stops_in_one_capture_keep_their_own_findings() -> None:
    from _modhelp import capture
    from auditor.modules.context import FocusPair
    from auditor.schema import BBox, FocusStep

    on, off = views()
    draw_ring(on, RECT, RING, 1)
    steps = []
    focus = {}
    for i in range(2):
        step = FocusStep(
            index=i,
            file_on="a",
            file_off="b",
            rect=BBox(x=60, y=60, w=120, h=40),
            scroll={"x": 0, "y": 100 * i},
            png_scale=1.0,
        )
        steps.append(step)
        focus[i] = FocusPair(step, on, off)
    ctx = focus_ctx(on, off, RECT)
    ctx = type(ctx)(
        capture().model_copy(update={"focus_steps": steps}), [], canvas(), ctx.protocol, focus=focus
    )
    findings = sc_2_4_13.run(ctx)
    assert [f.focus_index for f in findings] == [0, 1]
    assert [f.bbox.y for f in findings if f.bbox] == [60, 160]


def test_unsettled_page_lowers_the_tier() -> None:
    on, off = views()
    draw_ring(on, RECT, RING, 1)
    on[150:200, 200:300] = (0, 0, 0)
    (f,) = run(on, off)
    assert f.tier == "needs-review"
