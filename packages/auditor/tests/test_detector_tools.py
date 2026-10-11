import csv
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from auditor.detector import label_noise, smoke_train
from auditor.eval import ablation
from PIL import Image


def metrics(precision: float, recall: float, detector: bool = False) -> dict[str, object]:
    cell = {"precision": precision, "recall": recall}
    return {
        "meta": {"benchmark_sha": "b", "protocol_sha": "p", "detector_loaded": detector},
        "metrics": {"pixel": {"real": {"2.5.8": cell}, "synthetic": {"2.5.8": cell}}},
    }


def test_ablation_table_reports_per_sc_deltas() -> None:
    text = ablation.table(metrics(1.0, 0.5), metrics(0.9, 0.8, True))
    assert "| 2.5.8 | 1.000 | 0.500 | 0.900 | 0.800 | 0.300 |" in text
    assert "## real" in text and "## synthetic" in text and "ADR-012" in text


def test_ablation_write_reads_the_two_runs(tmp_path: Path) -> None:
    for name, m in (("dom", metrics(1, 1)), ("detector", metrics(1, 1, True))):
        (tmp_path / name).mkdir()
        (tmp_path / name / "metrics.json").write_text(json.dumps(m))
    assert (
        ablation.write(tmp_path / "dom", tmp_path / "detector", tmp_path / "o").name
        == "ablation.md"
    )


def test_label_noise_sample_is_seeded_and_summarised(tmp_path: Path) -> None:
    dataset = tmp_path / "ds"
    (dataset / "valid").mkdir(parents=True)
    Image.new("RGB", (300, 200), "white").save(dataset / "valid" / "a.png")
    manifest = {
        "items": [
            {
                "file": "valid/a.png",
                "boxes": [{"class": "link", "bbox": [10, 10, 80, 20]} for _ in range(5)],
            },
            {"file": "train/b.png", "boxes": [{"class": "text", "bbox": [0, 0, 5, 5]}]},
        ]
    }
    (dataset / "manifest.json").write_text(json.dumps(manifest))
    path = label_noise.build(dataset, tmp_path / "o", n=3, seed=1)
    rows = list(csv.DictReader(path.open()))
    assert len(rows) == 3 and all(r["class"] == "link" for r in rows)
    assert (tmp_path / "o" / rows[0]["crop"]).is_file()
    for i, row in enumerate(rows):
        row["correct"] = "1" if i < 2 else "0"
    with path.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    out = label_noise.summarise(path)
    assert out["checked"] == 3 and out["noise_rate"] == pytest.approx(1 / 3)


def test_smoke_decision_follows_the_throughput_floor(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def ok(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(smoke_train, "train", ok)
    monkeypatch.setattr(smoke_train, "environment", lambda: {"torch": "x"})
    monkeypatch.setattr(smoke_train.PeakMemory, "_run", lambda self: None)
    clock = iter([0.0, 100.0, 100.0, 100.0])
    monkeypatch.setattr(
        smoke_train, "time", SimpleNamespace(time=lambda: next(clock), sleep=lambda s: None)
    )
    slow = smoke_train.run(tmp_path, tmp_path / "o", 50, 8, 560)
    assert slow["images_per_second"] == 0.5 and slow["decision"] == "faster-rcnn-fallback"
    clock = iter([0.0, 10.0, 10.0, 10.0])
    monkeypatch.setattr(
        smoke_train, "time", SimpleNamespace(time=lambda: next(clock), sleep=lambda s: None)
    )
    fast = smoke_train.run(tmp_path, tmp_path / "o", 50, 8, 560)
    assert fast["decision"] == "rfdetr"


def test_smoke_records_failures_as_a_fallback_decision(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def boom(*_a: object, **_k: object) -> None:
        raise RuntimeError("mps op missing")

    monkeypatch.setattr(smoke_train, "train", boom)
    monkeypatch.setattr(smoke_train, "environment", lambda: {})
    monkeypatch.setattr(smoke_train.PeakMemory, "_run", lambda self: None)
    result = smoke_train.run(tmp_path, tmp_path / "o", 10, 8, 560)
    assert result["ok"] is False and "mps op missing" in str(result["error"])
    assert result["decision"] == "faster-rcnn-fallback"


def test_a_missing_dependency_is_not_reported_as_a_fallback_verdict(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def missing(*_a: object, **_k: object) -> None:
        raise ImportError("RF-DETR training dependencies are missing")

    monkeypatch.setattr(smoke_train, "train", missing)
    monkeypatch.setattr(smoke_train, "environment", lambda: {})
    monkeypatch.setattr(smoke_train.PeakMemory, "_run", lambda self: None)
    result = smoke_train.run(tmp_path, tmp_path / "o", 10, 8, 576)
    assert result["ok"] is False and str(result["decision"]).startswith("dependency-missing")
