import numpy as np
from _modhelp import canvas, draw_ring, element, focus_ctx, grey_for_ratio
from auditor.modules import sc_2_4_7

RECT = (60, 60, 120, 40)


def pair() -> tuple[np.ndarray, np.ndarray]:
    off = canvas(300, 200)
    off[60:100, 60:180] = (0x0B, 0x57, 0xD0)
    return off.copy(), off


def test_no_pixel_change_means_no_visible_indicator() -> None:
    on, off = pair()
    (f,) = sc_2_4_7.run(focus_ctx(on, off, RECT))
    assert f.sc == "2.4.7" and f.focus_index == 0 and f.tier == "automated"
    assert f.evidence["changed_px"] == 0 and f.evidence["state_contrast_max"] is None


def test_a_change_below_the_visibility_ratio_is_not_visible_r1() -> None:
    on, off = pair()
    draw_ring(on, RECT, (0xE5, 0xE7, 0xEB), 1, offset=0)
    (f,) = sc_2_4_7.run(focus_ctx(on, off, RECT))
    assert f.evidence["state_contrast_max"] < 1.5 and f.evidence["rule"] == "R1"


def test_a_change_at_or_above_the_visibility_ratio_is_visible() -> None:
    on, off = pair()
    draw_ring(on, RECT, grey_for_ratio(1.6), 2)
    assert sc_2_4_7.run(focus_ctx(on, off, RECT)) == []


def test_a_crisp_border_is_not_masked_by_a_large_faint_fill_change() -> None:
    on, off = pair()
    on[60:100, 60:180] = (0x0C, 0x58, 0xD1)
    on[60:100, 60:62] = (0, 0, 0)
    assert sc_2_4_7.run(focus_ctx(on, off, RECT)) == []


def test_bbox_is_the_rect_plus_scroll_in_document_px() -> None:
    on, off = pair()
    (f,) = sc_2_4_7.run(focus_ctx(on, off, RECT, scroll=(10, 300)))
    assert f.bbox is not None and (f.bbox.x, f.bbox.y, f.bbox.w, f.bbox.h) == (70, 360, 120, 40)


def test_unsettled_page_lowers_the_tier_r2() -> None:
    on, off = pair()
    on[150:200, 200:300] = (0, 0, 0)
    (f,) = sc_2_4_7.run(focus_ctx(on, off, RECT))
    assert f.tier == "needs-review" and f.evidence["unsettled"] is True


def test_entirely_covered_stop_is_not_assessable_r6() -> None:
    on, off = pair()
    header = element("fixed_region", 0, 0, 300, 200, {"alpha": 1.0})
    assert sc_2_4_7.run(focus_ctx(on, off, RECT, elements=[header], has_geometry=True)) == []


def test_zero_size_and_offscreen_rects_are_skipped() -> None:
    on, off = pair()
    assert sc_2_4_7.run(focus_ctx(on, off, (0, 0, 0, 0))) == []
    assert sc_2_4_7.run(focus_ctx(on, off, (5000, 5000, 50, 50))) == []


def test_a_scaled_non_responsive_view_is_judged_the_same() -> None:
    scale = 0.5
    off = canvas(150, 100)
    off[30:50, 30:90] = (0x0B, 0x57, 0xD0)
    on = off.copy()
    on[28:30, 28:92] = grey_for_ratio(4.0)
    assert sc_2_4_7.run(focus_ctx(on, off, RECT, scale=scale)) == []
    assert len(sc_2_4_7.run(focus_ctx(off.copy(), off, RECT, scale=scale))) == 1


def test_mismatched_image_sizes_yield_no_verdict() -> None:
    on, off = pair()
    assert sc_2_4_7.run(focus_ctx(on[:100], off, RECT)) == []


def test_stops_keep_their_own_selector_in_the_evidence() -> None:
    on, off = pair()
    (f,) = sc_2_4_7.run(focus_ctx(on, off, RECT))
    assert f.evidence["selector"] == "button#x"
