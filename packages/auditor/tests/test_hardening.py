import csv
import importlib.util
import json
import sys
import types
from pathlib import Path
from typing import Any

import pytest
from auditor.detector import label_noise, train
from auditor.elements import select
from auditor.eval import ablation

ROOT = Path(__file__).resolve().parents[3]


def load_report() -> Any:
    pytest.importorskip("pycocotools")
    spec = importlib.util.spec_from_file_location(
        "detector_report", ROOT / "scripts/detector_report.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def coco_truth() -> Any:
    from pycocotools.coco import COCO  # type: ignore[import-untyped]

    truth = COCO()
    truth.dataset = {
        "images": [{"id": 1, "width": 100, "height": 100}],
        "annotations": [
            {
                "id": 1,
                "image_id": 1,
                "category_id": 1,
                "bbox": [10, 10, 20, 20],
                "area": 400,
                "iscrowd": 0,
            }
        ],
        "categories": [{"id": 1, "name": "a"}, {"id": 2, "name": "b"}],
    }
    truth.createIndex()
    return truth


def test_report_zero_detections_returns_zeros() -> None:
    assert load_report().coco_stats(coco_truth(), []) == [0.0] * 12


def test_report_formats_missing_class_as_na() -> None:
    report = load_report()
    assert report.fmt_ap(-1.0) == "n/a"
    assert report.fmt_ap(None) == "n/a"
    assert report.fmt_ap(0.25) == "0.2500"


def test_report_curve_dedupes_epochs_keeping_last(tmp_path: Path) -> None:
    src = tmp_path / "metrics.csv"
    with src.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["epoch", "val/ema_mAP_50_95", "val/ema_mAP_50"])
        w.writerows([[0, 0.1, 0.2], [1, 0.3, 0.4], [1, 0.5, 0.6]])
    rows = load_report().training_curve(src, tmp_path / "curve.csv")
    assert [(r["epoch"], r["ema_mAP_50_95"]) for r in rows] == [(1, 0.1), (2, 0.5)]


def test_label_noise_no_rows_checked(tmp_path: Path) -> None:
    src = tmp_path / "label_noise.csv"
    src.write_text("id,file,class,bbox,crop,correct\n0,a,b,[],c,\n")
    assert label_noise.summarise(src) == {"checked": 0, "correct": 0, "noise_rate": None}


def test_selector_detector_mode_starts_no_dom_browser(monkeypatch: pytest.MonkeyPatch) -> None:
    import auditor.elements.detector as det

    monkeypatch.setattr(det, "model_path", lambda: Path("x.onnx"))
    monkeypatch.setattr(det, "DetectorElementSource", lambda path: object())
    monkeypatch.setattr(select, "DomElementSource", lambda: pytest.fail("DOM browser started"))
    selector = select.SourceSelector("detector")
    assert selector.detector_loaded
    selector.close()


def test_selector_auto_falls_back_on_corrupt_model(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    import auditor.elements.detector as det

    def boom(path: Path) -> Any:
        raise RuntimeError("corrupt")

    monkeypatch.setattr(det, "model_path", lambda: tmp_path / "bad.onnx")
    monkeypatch.setattr(det, "DetectorElementSource", boom)

    class FakeDom:
        def __enter__(self) -> "FakeDom":
            return self

        def close(self) -> None:
            pass

    monkeypatch.setattr(select, "DomElementSource", FakeDom)
    selector = select.SourceSelector("auto")
    assert not selector.detector_loaded
    assert selector.pixel is selector.ocr
    assert "corrupt" in selector.stage_warnings[0]
    with pytest.raises(RuntimeError):
        monkeypatch.setattr(select, "DomElementSource", FakeDom)
        select.SourceSelector("detector")


def test_ablation_rejects_bad_metrics() -> None:
    good = {"meta": {"benchmark_sha": "a", "protocol_sha": "b"}, "metrics": {"pixel": {}}}
    with pytest.raises(ValueError, match="pixel"):
        ablation.table(good, {**good, "metrics": {"dom": {}}})
    with pytest.raises(ValueError, match="meta"):
        ablation.table({"metrics": {}}, good)
    with pytest.raises(ValueError, match="benchmark_sha"):
        ablation.table({"meta": {}, "metrics": {"pixel": {}}}, good)


class FakeTrainer:
    def __init__(self) -> None:
        self.callbacks: list[Any] = []


def fake_rfdetr(monkeypatch: pytest.MonkeyPatch) -> Any:
    pytest.importorskip("torch")
    rt = types.ModuleType("rfdetr.training")
    rt.build_trainer = lambda *a, **k: FakeTrainer()  # type: ignore[attr-defined]
    pkg = types.ModuleType("rfdetr")
    pkg.training = rt  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "rfdetr", pkg)
    monkeypatch.setitem(sys.modules, "rfdetr.training", rt)
    return rt


def test_extra_callbacks_fails_when_trainer_never_built(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_rfdetr(monkeypatch)
    with pytest.raises(RuntimeError, match="not attached"), train.extra_callbacks([object()]):
        pass


def test_extra_callbacks_ok_when_attached(monkeypatch: pytest.MonkeyPatch) -> None:
    rt = fake_rfdetr(monkeypatch)
    cb = object()
    with train.extra_callbacks([cb]):
        assert cb in rt.build_trainer().callbacks


def test_config_not_overwritten_on_resume(tmp_path: Path) -> None:
    path = tmp_path / "config.json"
    train.write_config(path, {"seed": 1, "environment": {"torch": "a"}}, None)
    train.write_config(path, {"seed": 2, "environment": {"torch": "b"}}, tmp_path / "c.ckpt")
    saved = json.loads(path.read_text())
    assert saved["seed"] == 1
    assert saved["resumes"][0]["environment"] == {"torch": "b"}
    assert saved["resumes"][0]["resume"].endswith("c.ckpt")


def test_resume_check_ignores_workers_but_not_device_or_manifest(tmp_path: Path) -> None:
    (tmp_path / "config.json").write_text(
        json.dumps({"num_workers": 4, "device": "mps", "manifest_sha256": "x"})
    )
    train.check_resume_config(tmp_path, {"num_workers": 0, "device": "mps", "manifest_sha256": "x"})
    for bad in ({"device": "cpu"}, {"manifest_sha256": "y"}):
        with pytest.raises(SystemExit):
            train.check_resume_config(tmp_path, {"device": "mps", "manifest_sha256": "x", **bad})
