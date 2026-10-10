from _modhelp import canvas, ctx, element
from auditor.elements.base import Element
from auditor.modules import sc_2_5_8
from auditor.schema import Finding


def run(*elements: Element) -> list[Finding]:
    return sc_2_5_8.run(ctx(canvas(), list(elements)))


def toolbar(size: float, gap: float, n: int = 4) -> list[Element]:
    return [
        element("button", 120 + i * (size + gap), 240, size, size, dom_ref=f"button#b{i}")
        for i in range(n)
    ]


def test_adjacent_undersized_buttons_all_fail() -> None:
    findings = run(*toolbar(22, 0))
    assert len(findings) == 4
    assert findings[0].evidence["size_px"] == {"w": 22, "h": 22}
    assert findings[0].severity == "serious" and findings[0].tier == "automated"
    assert findings[0].sc == "2.5.8"


def test_exactly_the_minimum_size_passes() -> None:
    assert run(*toolbar(24, 0)) == []


def test_one_short_dimension_is_enough_to_fail() -> None:
    narrow = [element("button", 100, 100, 20, 40), element("button", 120, 100, 20, 40)]
    assert len(run(*narrow)) == 2


def test_an_isolated_undersized_target_passes_by_the_spacing_exception() -> None:
    assert run(element("button", 100, 100, 10, 10)) == []


def test_spacing_exception_when_circles_do_not_intersect() -> None:
    assert run(*toolbar(18, 32)) == []


def test_circles_that_only_touch_satisfy_the_spacing_exception() -> None:
    assert run(*toolbar(18, 6)) == []


def test_circles_that_overlap_by_a_pixel_do_not() -> None:
    assert len(run(*toolbar(18, 5))) == 4


def test_circle_reaching_a_large_neighbour_target_fails() -> None:
    small = element("button", 100, 100, 18, 18)
    near_large = element("button", 115, 95, 100, 30)
    findings = run(small, near_large)
    assert [f.bbox.x for f in findings if f.bbox] == [100]


def test_large_neighbour_beyond_the_circle_does_not_count() -> None:
    small = element("button", 100, 100, 18, 18)
    far_large = element("button", 131, 95, 100, 30)
    assert run(small, far_large) == []


def prose() -> list[Element]:
    p = "html > body > p"
    return [
        element("text", 10, 100, 290, 18, dom_ref=p, text="Read the"),
        element("link", 300, 100, 40, 18, dom_ref=p + " > a"),
        element("text", 340, 100, 60, 18, dom_ref=p, text="and the"),
        element("link", 400, 100, 40, 18, dom_ref=p + " > a"),
        element("text", 440, 100, 160, 18, dom_ref=p, text="for details"),
    ]


def test_inline_links_in_a_prose_line_are_exempt() -> None:
    assert run(*prose()) == []


def test_the_same_links_outside_prose_fail() -> None:
    nav = [
        element("link", 300, 100, 20, 18, dom_ref="html > body > nav > a"),
        element("link", 320, 100, 20, 18, dom_ref="html > body > nav > a"),
    ]
    assert len(run(*nav)) == 2


def test_user_agent_default_controls_are_exempt() -> None:
    plain = element("choice", 50, 50, 13, 13, {"unstyled_native": True}, is_native=True)
    other = element("choice", 60, 50, 13, 13, {"unstyled_native": True}, is_native=True)
    assert run(plain, other) == []
    styled = element("choice", 50, 50, 13, 13, {"unstyled_native": False}, is_native=True)
    assert len(run(styled, other)) == 1


def test_disabled_text_and_image_elements_are_not_targets() -> None:
    off = element("button", 10, 10, 10, 10, is_disabled=True)
    txt = element("text", 20, 10, 10, 10)
    img = element("image_icon", 30, 10, 10, 10)
    assert run(off, txt, img) == []


def test_evidence_lists_each_exception_tested() -> None:
    (first, *_) = run(*toolbar(10, 0, n=2))
    names = [e["exception"] for e in first.evidence["exception_tested"]]
    assert names == ["user-agent", "inline", "spacing", "equivalent"]
    assert first.evidence["exception_tested"][-1]["applies"] is None


def test_vertical_stack_of_small_targets_fails() -> None:
    stack = [element("button", 100, 100 + 20 * i, 20, 20) for i in range(4)]
    assert len(run(*stack)) == 4


def test_diagonal_neighbour_is_judged_by_euclidean_distance() -> None:
    a = element("button", 100, 100, 18, 18)
    near = element("button", 112, 112, 18, 18)
    far = element("button", 130, 130, 18, 18)
    assert len(run(a, near)) == 2
    assert run(a, far) == []


def test_overlapping_small_targets_fail() -> None:
    assert len(run(element("button", 100, 100, 18, 18), element("button", 105, 100, 18, 18))) == 2


def test_a_target_nested_in_another_is_not_its_neighbour() -> None:
    outer = element("link", 100, 100, 60, 40, dom_ref="a")
    inner = element("button", 110, 110, 18, 18, dom_ref="a > b")
    assert run(outer, inner) == []


def test_zero_size_boxes_are_ignored() -> None:
    assert run(element("button", 10, 10, 0, 0), element("button", 10, 10, 5, 0)) == []


def test_a_disabled_neighbour_still_denies_the_spacing_exception() -> None:
    small = element("button", 100, 100, 18, 18)
    off = element("button", 110, 100, 18, 18, is_disabled=True)
    assert [f.bbox.x for f in run(small, off) if f.bbox] == [100]


def test_user_agent_exception_is_marked_applicable_when_it_exempts() -> None:
    from auditor.modules import sc_2_5_8 as mod

    styled = element("choice", 50, 50, 13, 13, {"unstyled_native": False}, is_native=True)
    other = element("choice", 60, 50, 13, 13, {"unstyled_native": False}, is_native=True)
    (first, *_) = mod.run(ctx(canvas(), [styled, other]))
    assert first.evidence["exception_tested"][0] == {"exception": "user-agent", "applies": False}
