import csv
import json
import random
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from auditor import pipeline
from auditor.cli import app
from auditor.detector import label_noise
from auditor.detector import prepare_webui as pw
from auditor.detector import train as train_mod
from auditor.detector.infer import Detector
from auditor.elements.detector import MODEL_ENV, DetectorElementSource
from auditor.elements.select import SourceSelector
from auditor.eval.harness import EvalConfig, run_eval
from auditor.schema import Capture, Run
from PIL import Image
from typer.testing import CliRunner

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
RES = 64


def tiny_onnx(path: Path, boxes: list[list[float]], cls: int) -> Path:
    """A constant-output detector: every input yields these normalised boxes as class `cls`."""
    onnx = pytest.importorskip("onnx")
    from onnx import TensorProto, helper, numpy_helper

    q = len(boxes)
    logits = np.full((1, q, 7), -10.0, dtype=np.float32)
    logits[0, :, cls] = 6.0
    logits[0, :, 6] = 9.0
    nodes = [
        helper.make_node(
            "Constant", [], ["dets"], value=numpy_helper.from_array(np.array([boxes], np.float32))
        ),
        helper.make_node("Constant", [], ["labels"], value=numpy_helper.from_array(logits)),
    ]
    graph = helper.make_graph(
        nodes,
        "tiny",
        [helper.make_tensor_value_info("input", TensorProto.FLOAT, [1, 3, "h", "w"])],
        [
            helper.make_tensor_value_info("dets", TensorProto.FLOAT, [1, q, 4]),
            helper.make_tensor_value_info("labels", TensorProto.FLOAT, [1, q, 7]),
        ],
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)])
    model.ir_version = 9
    onnx.save(model, path)
    return path


def test_a_real_onnx_file_round_trips_through_onnxruntime(tmp_path: Path) -> None:
    path = tiny_onnx(tmp_path / "d.onnx", [[0.5, 0.5, 0.25, 0.1]], cls=2)
    detector = Detector(path, resolution=RES)
    found = detector.detect(np.zeros((200, 400, 3), dtype=np.uint8), (200, 400))
    assert [d.cls for d in found] == ["button"]
    box = found[0].bbox
    assert (box.x, box.y, box.w, box.h) == pytest.approx((150, 90, 100, 20), abs=0.5)
    assert found[0].score > 0.99


def real_capture() -> Capture:
    return Capture.from_folder(next(FIXTURES.glob("real/real_com_003_desktop_*")))


def test_the_detector_source_reads_the_model_named_by_the_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tiny_onnx(tmp_path / "d.onnx", [[0.2, 0.2, 0.1, 0.05]], cls=1)
    monkeypatch.setenv(MODEL_ENV, str(path))
    selector = SourceSelector("detector")
    try:
        name, source = selector.for_capture(real_capture())
        assert name == "pixel" and selector.detector_loaded
        assert source.detector is not None
    finally:
        selector.close()
    elements = DetectorElementSource(path).elements(real_capture())
    assert elements and {e.kind for e in elements} == {"link"}


def test_eval_with_the_detector_records_it_and_changes_the_pixel_numbers(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    pytest.importorskip("onnx")
    boxes = [[0.1 + 0.05 * i, 0.3, 0.02, 0.02] for i in range(4)]
    monkeypatch.setenv(MODEL_ENV, str(tiny_onnx(tmp_path / "d.onnx", boxes, cls=2)))
    bench = FIXTURES / "synth" / "sc2-5-8"
    dom = run_eval(
        EvalConfig(
            benchmark=bench, out=tmp_path / "dom", conditions=["pixel"], bootstrap=0, elements="dom"
        )
    )
    det = run_eval(
        EvalConfig(
            benchmark=bench,
            out=tmp_path / "det",
            conditions=["pixel"],
            bootstrap=0,
            elements="detector",
        )
    )
    assert det["meta"]["detector_loaded"] is True and det["meta"]["elements_mode"] == "detector"
    assert dom["meta"]["elements_mode"] == "dom"
    cell = det["metrics"]["pixel"]["synthetic"]["2.5.8"]
    assert dom["metrics"]["pixel"]["synthetic"]["2.5.8"]["tp"] == 4
    assert cell["tp"] + cell["fp"] + cell["fn"] > 0
    assert det["metrics"] != dom["metrics"]


def test_screenshot_only_run_gives_needs_review_findings_for_detected_controls(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    boxes = [[0.1 + 0.01 * i, 0.5, 0.02, 0.02] for i in range(4)]
    monkeypatch.setenv(MODEL_ENV, str(tiny_onnx(tmp_path / "d.onnx", boxes, cls=2)))
    shot = tmp_path / "page.png"
    Image.fromarray(np.full((900, 1440, 3), 255, dtype=np.uint8)).save(shot)
    run = pipeline.run_screenshots([shot], tmp_path / "out")
    assert run.source_kind == "upload" and run.stage_status["detector"] == "loaded"
    targets = [f for f in run.findings if f.sc == "2.5.8"]
    assert targets and {f.tier for f in targets} == {"needs-review"}
    verdicts = {c.sc: c.hybrid_verdict for c in run.coverage.cells}
    assert verdicts["2.5.8"] == "needs-review" and verdicts["2.4.7"] == "not-assessable"
    assert Run.model_validate_json((tmp_path / "out" / "report.json").read_text()).id == run.id


def test_screenshot_only_run_without_a_model_has_no_control_findings(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv(MODEL_ENV, str(tmp_path / "missing.onnx"))
    shot = tmp_path / "page.png"
    Image.fromarray(np.full((844, 390, 3), 255, dtype=np.uint8)).save(shot)
    run = pipeline.run_screenshots([shot], tmp_path / "out")
    assert run.viewports == ["mobile"] and run.stage_status["detector"] == "absent"
    assert not [f for f in run.findings if f.sc in {"1.4.11", "2.5.8"}]
    verdicts = {c.sc: c.pixel_verdict for c in run.coverage.cells}
    assert verdicts["1.4.3"] == "needs-review" and verdicts["2.5.8"] == "not-assessable"


def test_cli_screenshots_option(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(MODEL_ENV, str(tmp_path / "missing.onnx"))
    shot = tmp_path / "a.png"
    Image.fromarray(np.full((200, 300, 3), 255, dtype=np.uint8)).save(shot)
    ok = CliRunner().invoke(app, ["run", "--screenshots", str(shot), "--out", str(tmp_path / "o")])
    assert ok.exit_code == 0 and (tmp_path / "o" / "report.json").is_file()
    both = CliRunner().invoke(
        app, ["run", "--screenshots", str(shot), "--folder", str(tmp_path), "--out", str(tmp_path)]
    )
    assert both.exit_code == 1
    missing = CliRunner().invoke(app, ["run", "--screenshots", str(tmp_path / "nope.png")])
    assert missing.exit_code == 1


def test_ablate_command_writes_the_table(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[str] = []

    def fake_run_eval(cfg: EvalConfig) -> dict[str, Any]:
        seen.append(cfg.elements)
        cfg.out.mkdir(parents=True, exist_ok=True)
        metrics = {
            "meta": {
                "benchmark_sha": "b",
                "protocol_sha": "p",
                "detector_loaded": cfg.elements == "detector",
            },
            "metrics": {
                "pixel": {"real": {}, "synthetic": {"2.5.8": {"precision": 1.0, "recall": 0.5}}}
            },
        }
        (cfg.out / "metrics.json").write_text(json.dumps(metrics))
        return metrics

    monkeypatch.setattr("auditor.eval.harness.run_eval", fake_run_eval)
    result = CliRunner().invoke(
        app, ["ablate", "--benchmark", str(tmp_path), "--out", str(tmp_path / "o")]
    )
    assert result.exit_code == 0 and seen == ["dom", "detector"]
    assert "2.5.8" in (tmp_path / "o" / "ablation.md").read_text()


def test_hash_index_matches_the_python_distance() -> None:
    rng = random.Random(3)
    index = pw.HashIndex()
    assert index.min_distance(5) == pw.PHASH_SIZE * pw.PHASH_SIZE
    values = [rng.getrandbits(256) for _ in range(20)]
    for v in values:
        index.add(v)
    probe = rng.getrandbits(256)
    assert index.min_distance(probe) == min(pw.hamming(probe, v) for v in values)
    assert index.min_distance(values[4]) == 0


def test_prepare_fails_closed_without_benchmark_pages(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="no benchmark pages"):
        pw.prepare([], tmp_path / "o", 1, 1, 1, None)
    with pytest.raises(ValueError, match="no benchmark pages"):
        pw.prepare([], tmp_path / "o", 1, 1, 1, tmp_path)
    assert pw.prepare([], tmp_path / "o2", 1, 1, 1, None, allow_unscreened=True)["counts"] == {
        "train": 0,
        "valid": 0,
    }


def test_train_records_the_manifest_hash_and_passes_resume_through(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import hashlib

    calls: dict[str, Any] = {}

    class FakeModel:
        def train(self, **kwargs: Any) -> None:
            calls.update(kwargs)

    monkeypatch.setattr(train_mod, "build_model", lambda m, r, d: FakeModel())
    monkeypatch.setattr(train_mod, "environment", lambda: {"torch": "x"})
    data = tmp_path / "ds"
    data.mkdir()
    (data / "manifest.json").write_text("{}")
    ckpt = tmp_path / "last.ckpt"
    train_mod.train(data, tmp_path / "run", epochs=2, resume=ckpt)
    config = json.loads((tmp_path / "run" / "config.json").read_text())
    assert config["manifest_sha256"] == hashlib.sha256(b"{}").hexdigest()
    assert config["ema"] is True and config["amp"] is False and config["resolution"] == 576
    assert calls["resume"] == str(ckpt) and calls["use_ema"] is True and calls["epochs"] == 2


def test_label_noise_sample_is_deterministic_for_a_seed(tmp_path: Path) -> None:
    dataset = tmp_path / "ds"
    (dataset / "valid").mkdir(parents=True)
    Image.new("RGB", (300, 200), "white").save(dataset / "valid" / "a.png")
    items = [
        {
            "file": "valid/a.png",
            "boxes": [{"class": "link", "bbox": [i, 10, 40, 20]} for i in range(30)],
        }
    ]
    (dataset / "manifest.json").write_text(json.dumps({"items": items}))
    first = label_noise.build(dataset, tmp_path / "a", n=10, seed=5)
    again = label_noise.build(dataset, tmp_path / "b", n=10, seed=5)
    other = label_noise.build(dataset, tmp_path / "c", n=10, seed=6)
    rows = [list(csv.reader(p.open())) for p in (first, again, other)]
    assert rows[0] == rows[1] and rows[0] != rows[2]
