from _modhelp import canvas, ctx, element
from auditor.elements.base import Element
from auditor.modules import sc_2_5_7
from auditor.schema import Finding


def run(*elements: Element) -> list[Finding]:
    return sc_2_5_7.run(ctx(canvas(), list(elements)))


def custom(alternatives: list[dict[str, str | None]]) -> Element:
    return element("slider", 100, 100, 22, 22, {"alternatives": alternatives}, dom_ref="div#s")


def test_custom_slider_without_an_alternative_fails_critical_o7() -> None:
    (f,) = run(custom([]))
    assert f.sc == "2.5.7" and f.severity == "critical" and f.tier == "automated"
    assert f.evidence["rule"] == "O7" and f.evidence["alternatives_found"] == 0


def test_a_neighbouring_control_is_a_single_pointer_alternative() -> None:
    assert run(custom([{"tag": "input", "type": "number", "role": None}])) == []
    assert run(custom([{"tag": "button", "type": None, "role": None}])) == []


def test_native_range_input_passes() -> None:
    native = element("slider", 100, 100, 200, 20, {"alternatives": []}, is_native=True)
    assert run(native) == []


def test_without_dom_structure_nothing_is_reported() -> None:
    assert run(element("slider", 100, 100, 22, 22, {})) == []


def test_disabled_and_non_slider_elements_are_ignored() -> None:
    off = element("slider", 100, 100, 22, 22, {"alternatives": []}, is_disabled=True)
    btn = element("button", 10, 10, 30, 30, {"alternatives": []})
    assert run(off, btn) == []
