import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest
from auditor.modules.color import blend, contrast_ratio, hex_of, parse_css_color

HERE = Path(__file__).resolve().parent
SA_TOOLS = HERE.parents[2].parent / "04_Data_Collection" / "annotation" / "sa_tools.py"
VECTORS = json.loads((HERE / "vectors.json").read_text())["vectors"]


def h(s: str) -> tuple[int, int, int]:
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def test_seven_vectors_equal_sa_tools_ratio() -> None:
    assert len(VECTORS) == 7
    for v in VECTORS:
        assert contrast_ratio(h(v["a"]), h(v["b"])) == pytest.approx(v["ratio"], rel=1e-12)


def test_ratio_is_symmetric() -> None:
    assert contrast_ratio(h("777777"), h("FFFFFF")) == contrast_ratio(h("FFFFFF"), h("777777"))


def test_matches_live_sa_tools_when_available() -> None:
    if not SA_TOOLS.exists():
        if os.environ.get("REQUIRE_BENCHMARK") == "1":
            pytest.fail("sa_tools.py not available")
        pytest.skip("sa_tools.py not available")
    spec = importlib.util.spec_from_file_location("sa_tools", SA_TOOLS)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    argv, sys.argv = sys.argv, ["sa_tools"]
    try:
        spec.loader.exec_module(module)
    finally:
        sys.argv = argv
    for v in VECTORS:
        assert contrast_ratio(h(v["a"]), h(v["b"])) == module.ratio(h(v["a"]), h(v["b"]))


def test_errata_7f7f7f_is_4_00_not_4_48() -> None:
    assert round(contrast_ratio(h("7F7F7F"), h("FFFFFF")), 2) == 4.0
    assert round(contrast_ratio(h("777777"), h("FFFFFF")), 2) == 4.48


@pytest.mark.parametrize(
    ("css", "expected"),
    [
        ("rgb(1, 2, 3)", ((1, 2, 3), 1.0)),
        ("rgba(1, 2, 3, 0.5)", ((1, 2, 3), 0.5)),
        ("rgb(1 2 3 / 25%)", ((1, 2, 3), 0.25)),
        ("transparent", None),
        ("color(srgb 1 0 0)", None),
        (None, None),
        ("rgb(1, 2)", None),
        ("rgba(1, 2, 3, 0)", ((1, 2, 3), 0.0)),
        ("#ff0000", None),
        ("hsl(0, 100%, 50%)", None),
        ("12", None),
    ],
)
def test_parse_css_color(css: str | None, expected: object) -> None:
    assert parse_css_color(css) == expected


def test_blend_and_hex() -> None:
    assert blend((0, 0, 0), (255, 255, 255), 0.5) == (128, 128, 128)
    assert hex_of((11, 61, 145)) == "#0B3D91"
