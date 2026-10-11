import json
import sys
import types
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pytest
from auditor import pipeline, protocol
from auditor.detector import export_onnx
from auditor.elements import detector as detector_mod
from auditor.elements.detector import MODEL_ENV, DetectorElementSource
from auditor.schema import BBox
from PIL import Image


@dataclass
class StubDetection:
    cls: str
    score: float
    bbox: BBox


class StubDetector:
    def __init__(self, found: list[StubDetection]) -> None:
        self.found = found

    def detect(self, image: np.ndarray, size: tuple[int, int]) -> list[StubDetection]:
        return self.found


def install(monkeypatch: pytest.MonkeyPatch, tmp_path: Path, found: list[StubDetection]) -> Path:
    model = tmp_path / "stub.onnx"
    model.write_bytes(b"")
    monkeypatch.setenv(MODEL_ENV, str(model))
    monkeypatch.setattr(
        detector_mod,
        "DetectorElementSource",
        lambda path: DetectorElementSource(detector=StubDetector(found)),
    )
    shot = tmp_path / "page.png"
    Image.fromarray(np.full((900, 1440, 3), 255, dtype=np.uint8)).save(shot)
    return shot


def faint_field(tmp_path: Path) -> Path:
    shot = tmp_path / "page.png"
    page = np.full((900, 1440, 3), 255, dtype=np.uint8)
    page[100:140, 100:300] = 248
    Image.fromarray(page).save(shot)
    return shot


@pytest.mark.parametrize("cls", ["input", "choice"])
def test_low_contrast_detected_field_gives_a_needs_review_1_4_11_finding(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, cls: str
) -> None:
    found = [StubDetection(cls, 0.9, BBox(x=100, y=100, w=200, h=40))]
    install(monkeypatch, tmp_path, found)
    run = pipeline.run_screenshots([faint_field(tmp_path)], tmp_path / "out")
    hits = [f for f in run.findings if f.sc == "1.4.11"]
    assert hits and {f.tier for f in hits} == {"needs-review"}
    assert hits[0].evidence["ratio"] < hits[0].evidence["threshold"]
    assert hits[0].bbox == BBox(x=100, y=100, w=200, h=40)


def test_detector_provenance_is_what_makes_the_finding_needs_review(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from auditor.elements.base import Element
    from auditor.modules import sc_1_4_11
    from auditor.modules.context import ModuleContext
    from auditor.schema import Capture

    found = [StubDetection("input", 0.9, BBox(x=100, y=100, w=200, h=40))]
    install(monkeypatch, tmp_path, found)
    run = pipeline.run_screenshots([faint_field(tmp_path)], tmp_path / "out")
    assert {f.tier for f in run.findings if f.sc == "1.4.11"} == {"needs-review"}

    capture = Capture.from_folder(tmp_path / "out" / "capture_00")
    box = BBox(x=100, y=100, w=200, h=40)
    sourced = [Element(kind="input", bbox_css=box, style={"source": "detector"})]
    plain = [Element(kind="input", bbox_css=box, style={})]
    proto = protocol.load()
    tiers = {
        name: {
            f.tier for f in sc_1_4_11.run(ModuleContext.load(capture, els, proto, load_focus=False))
        }
        for name, els in (("detector", sourced), ("plain", plain))
    }
    assert tiers == {"detector": {"needs-review"}, "plain": {"automated"}}


def test_undersized_detected_targets_stay_needs_review_never_a_confirmed_fail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    found = [
        StubDetection("button", 0.9, BBox(x=100, y=100, w=12, h=12)),
        StubDetection("button", 0.9, BBox(x=110, y=100, w=12, h=12)),
    ]
    shot = install(monkeypatch, tmp_path, found)
    run = pipeline.run_screenshots([shot], tmp_path / "out")
    size = protocol.load().thresholds.target_size_px
    hits = [f for f in run.findings if f.sc == "2.5.8"]
    assert len(hits) == 2
    for f in hits:
        assert f.tier == "needs-review" and f.provenance == "pixel"
        assert f.evidence["size_px"]["w"] < size and f.evidence["size_px"]["h"] < size
        assert f.evidence["method"] == "dom-box" and f.evidence["text"] is None
    assert not [f for f in run.findings if f.tier == "automated"]


class FakeRfdetrModel:
    seen: dict[str, object] = {}

    def __init__(self, **kwargs: object) -> None:
        FakeRfdetrModel.seen = {"init": kwargs}

    def export(self, output_dir: str, **kwargs: object) -> None:
        FakeRfdetrModel.seen["export"] = {"output_dir": output_dir, **kwargs}
        (Path(output_dir) / "inference_model.onnx").write_bytes(b"onnx")


def test_export_discovers_the_onnx_and_writes_export_json(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from auditor.detector import classmap

    fake = types.ModuleType("rfdetr")
    fake.RFDETRNano = FakeRfdetrModel  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rfdetr", fake)
    ckpt = tmp_path / "best.pth"
    out = tmp_path / "export"
    result = export_onnx.export(ckpt, out, model="nano", resolution=320)
    assert result == out / "inference_model.onnx" and result.is_file()
    meta = json.loads((out / "export.json").read_text())
    assert meta == {
        "checkpoint": str(ckpt),
        "model": "nano",
        "resolution": 320,
        "opset": export_onnx.OPSET,
        "onnx": "inference_model.onnx",
        "classes": classmap.classes(),
    }
    init = FakeRfdetrModel.seen["init"]
    assert isinstance(init, dict)
    assert init["num_classes"] == len(classmap.classes()) and init["pretrain_weights"] == str(ckpt)
    shipped = FakeRfdetrModel.seen["export"]
    assert isinstance(shipped, dict)
    assert shipped["shape"] == (320, 320) and shipped["opset_version"] == export_onnx.OPSET


def test_export_fails_when_no_onnx_is_produced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Silent(FakeRfdetrModel):
        def export(self, output_dir: str, **kwargs: object) -> None:
            return None

    fake = types.ModuleType("rfdetr")
    fake.RFDETRNano = Silent  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rfdetr", fake)
    with pytest.raises(RuntimeError, match="no .onnx"):
        export_onnx.export(tmp_path / "c.pth", tmp_path / "o")
    assert not (tmp_path / "o" / "export.json").exists()
