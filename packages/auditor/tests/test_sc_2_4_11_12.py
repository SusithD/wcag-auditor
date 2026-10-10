from _modhelp import canvas, element, focus_ctx
from auditor.elements.base import Element
from auditor.modules import sc_2_4_11_12
from auditor.schema import Finding

RECT = (60, 20, 120, 40)


def run(
    elements: list[Element],
    fraction_rect: tuple[float, float, float, float] = RECT,
    scroll: tuple[float, float] = (0, 0),
    geometry: bool = True,
) -> tuple[list[Finding], list[Finding]]:
    on = off = canvas(300, 200)
    ctx = focus_ctx(
        on, off.copy(), fraction_rect, scroll=scroll, elements=elements, has_geometry=geometry
    )
    return sc_2_4_11_12.run_min(ctx), sc_2_4_11_12.run_enh(ctx)


def header(height: int, alpha: float = 1.0, kind: str = "fixed_region") -> Element:
    return element(kind, 0, 0, 300, height, {"alpha": alpha})


def test_entirely_under_an_opaque_fixed_header_fails_both() -> None:
    minimum, enhanced = run([header(100)])
    assert [f.sc for f in minimum] == ["2.4.11"] and [f.sc for f in enhanced] == ["2.4.12"]
    assert minimum[0].evidence["covered_fraction"] == 1.0 and minimum[0].tier == "automated"


def test_partly_covered_fails_only_the_enhanced_criterion() -> None:
    minimum, enhanced = run([header(40)])
    assert minimum == [] and len(enhanced) == 1
    assert 0 < enhanced[0].evidence["covered_fraction"] < 1


def test_not_covered_passes_both() -> None:
    assert run([header(10)]) == ([], [])


def test_translucent_or_absent_regions_do_not_obscure() -> None:
    assert run([header(100, alpha=0.5)]) == ([], [])
    assert run([]) == ([], [])


def test_a_sticky_region_is_only_trusted_at_zero_scroll() -> None:
    sticky = header(100, kind="sticky_region")
    assert run([sticky])[0] != []
    assert run([sticky], scroll=(0, 400)) == ([], [])


def test_a_fixed_region_still_counts_when_the_page_is_scrolled() -> None:
    assert run([header(100)], scroll=(0, 400))[0] != []


def test_without_geometry_an_unchanged_view_is_a_needs_review_2411_only() -> None:
    minimum, enhanced = run([], geometry=False)
    assert len(minimum) == 1 and minimum[0].tier == "needs-review" and enhanced == []
    assert minimum[0].evidence["method"] == "no-pixel-change"


def test_without_geometry_a_visible_change_means_no_finding() -> None:
    off = canvas(300, 200)
    on = off.copy()
    on[18:22, 58:182] = (0, 0, 0)
    ctx = focus_ctx(on, off, RECT, has_geometry=False)
    assert sc_2_4_11_12.run_min(ctx) == []


def test_two_regions_together_can_cover_the_whole_element() -> None:
    left = element("fixed_region", 0, 0, 120, 100, {"alpha": 1.0})
    right = element("fixed_region", 120, 0, 180, 100, {"alpha": 1.0})
    minimum, enhanced = run([left, right])
    assert len(minimum) == 1 and len(enhanced) == 1
    assert run([left]) == ([], run([left])[1]) and len(run([left])[1]) == 1


def test_a_focused_control_inside_the_fixed_region_is_not_obscured_by_it() -> None:
    nav = element("fixed_region", 0, 0, 300, 100, {"alpha": 1.0, "contains_refs": ["button#x"]})
    assert run([nav]) == ([], [])
    other = element("fixed_region", 0, 0, 300, 100, {"alpha": 1.0, "contains_refs": ["a#other"]})
    assert len(run([other])[0]) == 1


def test_an_entirely_covered_stop_that_still_shows_a_change_is_not_flagged() -> None:
    off = canvas(300, 200)
    on = off.copy()
    on[30:50, 70:170] = (0, 0, 0)
    ctx = focus_ctx(on, off, RECT, elements=[header(100)], has_geometry=True)
    assert sc_2_4_11_12.run_min(ctx) == [] and sc_2_4_11_12.run_enh(ctx) == []


def test_obscuring_is_judged_in_css_px_on_a_scaled_view() -> None:
    off = canvas(150, 100)
    ctx = focus_ctx(off.copy(), off, RECT, scale=0.5, elements=[header(100)], has_geometry=True)
    assert len(sc_2_4_11_12.run_min(ctx)) == 1


def test_the_pixel_fallback_only_looks_inside_the_element() -> None:
    off = canvas(300, 200)
    on = off.copy()
    on[5:9, 5:50] = (0, 0, 0)
    ctx = focus_ctx(on, off, RECT, has_geometry=False)
    assert len(sc_2_4_11_12.run_min(ctx)) == 1
