import json
from pathlib import Path

import numpy as np
from auditor.elements.base import Element
from auditor.features import compute, edge_density, is_non_responsive
from auditor.schema import BBox, Capture, Layout
from PIL import Image

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
GOLDEN = FIXTURES / "golden" / "elements"


def test_edge_density_flat_vs_striped() -> None:
    flat = Image.new("RGB", (40, 40), "white")
    stripes = np.zeros((40, 40, 3), dtype=np.uint8)
    stripes[:, ::2] = 255
    assert edge_density(flat, 16) == 0.0
    assert edge_density(Image.fromarray(stripes), 16) > 0.9


def test_non_responsive_only_for_the_mobile_fixture() -> None:
    flags = {
        p.parent.name: is_non_responsive(Capture.from_folder(p.parent))
        for p in FIXTURES.glob("**/meta.json")
        if "golden" not in p.parts
    }
    assert sum(flags.values()) == 1
    assert flags[next(n for n in flags if n.startswith("real_com_011_mobile"))]


def test_non_responsive_negative_controls() -> None:
    mobile = Capture.from_folder(next(FIXTURES.glob("real/real_com_011_mobile_*")))
    assert is_non_responsive(mobile)
    assert mobile.layout is not None
    responsive = mobile.layout.model_copy(update={"has_meta_viewport": True})
    assert not is_non_responsive(mobile.model_copy(update={"layout": responsive}))
    narrow = mobile.layout.model_copy(update={"layout_width": mobile.viewport_spec.width})
    assert not is_non_responsive(mobile.model_copy(update={"layout": narrow}))
    assert isinstance(mobile.layout, Layout)


def test_compute_counts_focus_stops_and_sticky() -> None:
    capture = Capture.from_folder(next(FIXTURES.glob("synth/sc2-5-8/*")))
    box = BBox(x=0, y=0, w=10, h=10)
    plain = [Element(kind="button", bbox_css=box)]
    sticky = [*plain, Element(kind="sticky_region", bbox_css=box)]
    assert compute(capture, plain).has_sticky is False
    feats = compute(capture, sticky)
    assert feats.has_sticky is True
    assert feats.focus_stop_count == len(capture.focus_steps)
    with Image.open(capture.path / "screenshot.png") as shot:
        megapixels = shot.size[0] * shot.size[1] / 1_000_000
    assert feats.element_density == round(1 / megapixels, 2)


def test_golden_features_agree_with_capture_meta() -> None:
    for golden in GOLDEN.glob("*.json"):
        folder = next(p.parent for p in FIXTURES.glob(f"**/{golden.stem}/meta.json"))
        capture = Capture.from_folder(folder)
        feats = json.loads(golden.read_text())["features"]
        assert feats["focus_stop_count"] == len(capture.focus_steps)
        assert feats["is_non_responsive"] == is_non_responsive(capture)
        assert 0.0 <= feats["edge_density"] <= 1.0
