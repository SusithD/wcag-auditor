import csv
import json
from pathlib import Path

from app.config import Settings
from fastapi.testclient import TestClient
from test_runs_api import client

VALIDATION = {
    "images": 10,
    "ground_truth_boxes": 40,
    "mAP_50_95": 0.25,
    "mAP_50": 0.4,
    "mAP_75": 0.26,
    "mAR_100": 0.35,
    "per_class_AP_50_95": {"link": 0.3, "text": 0.2, "widget": 0.1},
    "onnx_sha256": "ab" * 32,
    "manifest_sha256": "cd" * 32,
}
COLUMNS = ["id", "class", "geometry", "class_ok", "strict", "correct_geometry_and_class"]


def write_noise(directory: Path, rows: list[list[object]]) -> None:
    folder = directory / "label_noise"
    folder.mkdir(parents=True)
    with (folder / "label_noise_checked.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(COLUMNS)
        writer.writerows(rows)


def detector_client(tmp_path: Path, directory: Path) -> TestClient:
    return client(tmp_path, detector_eval_dir=directory)


def test_detector_eval_is_404_when_files_are_absent(tmp_path: Path) -> None:
    with detector_client(tmp_path, tmp_path / "missing") as c:
        assert c.get("/eval/detector").status_code == 404


def test_detector_eval_is_404_for_malformed_metrics(tmp_path: Path) -> None:
    directory = tmp_path / "det"
    directory.mkdir()
    (directory / "onnx_validation.json").write_text('{"images": 1}')
    with detector_client(tmp_path, directory) as c:
        assert c.get("/eval/detector").status_code == 404
    (directory / "onnx_validation.json").write_text("not json")
    with detector_client(tmp_path, directory) as c:
        assert c.get("/eval/detector").status_code == 404


def test_detector_eval_metrics_without_label_noise(tmp_path: Path) -> None:
    directory = tmp_path / "det"
    directory.mkdir()
    (directory / "onnx_validation.json").write_text(json.dumps(VALIDATION))
    with detector_client(tmp_path, directory) as c:
        body = c.get("/eval/detector").json()
    assert body["map_50_95"] == 0.25 and body["map_75"] == 0.26
    assert body["images"] == 10 and body["ground_truth_boxes"] == 40
    assert [r["name"] for r in body["per_class"]] == ["text", "link", "widget"]
    assert body["label_noise"] is None


def test_detector_eval_label_noise_is_computed_from_the_csv(tmp_path: Path) -> None:
    directory = tmp_path / "det"
    directory.mkdir()
    (directory / "onnx_validation.json").write_text(json.dumps(VALIDATION))
    write_noise(
        directory,
        [
            [0, "text", 1, 1, 1, 1],
            [1, "text", 1, 0, 0, 0],
            [2, "link", 0, 1, 0, 0],
            [3, "text", 1, 1, 1, 1],
        ],
    )
    with detector_client(tmp_path, directory) as c:
        noise = c.get("/eval/detector").json()["label_noise"]
    assert noise["sample_size"] == 4
    by_lens = {lens["lens"]: lens for lens in noise["lenses"]}
    assert by_lens["geometry"]["correct"] == 3 and by_lens["geometry"]["noise_rate"] == 0.25
    assert by_lens["class"]["correct"] == 3
    assert by_lens["box_and_class"]["correct"] == 2
    assert by_lens["box_and_class"]["noise_rate"] == 0.5
    assert by_lens["strict"]["correct"] == 2
    assert abs(by_lens["box_and_class"]["ci_half_width"] - 1.96 * 0.25) < 1e-9
    assert noise["sample_classes"] == [
        {"name": "text", "boxes": 3},
        {"name": "link", "boxes": 1},
    ]


def test_detector_eval_ignores_a_label_noise_file_with_bad_flags(tmp_path: Path) -> None:
    directory = tmp_path / "det"
    directory.mkdir()
    (directory / "onnx_validation.json").write_text(json.dumps(VALIDATION))
    write_noise(directory, [[0, "text", 1, "x", 1, 1]])
    with detector_client(tmp_path, directory) as c:
        assert c.get("/eval/detector").json()["label_noise"] is None


def test_detector_eval_route_does_not_shadow_numbered_evals(tmp_path: Path) -> None:
    with detector_client(tmp_path, tmp_path / "missing") as c:
        assert c.get("/eval/999").status_code == 404
        assert c.get("/eval").status_code == 200


def test_committed_report_matches_the_published_figures() -> None:
    settings = Settings(data_dir=Path("."), db_url="sqlite://")
    assert settings.detector_eval_path.parts[-2:] == ("eval", "detector")
    from app.detector_api import read_detector_eval

    result = read_detector_eval(settings.detector_eval_path)
    assert result is not None
    assert round(result.map_50_95, 3) == 0.239
    assert result.label_noise is not None and result.label_noise.sample_size == 200
    by_lens = {lens.lens: lens for lens in result.label_noise.lenses}
    assert [by_lens[k].correct for k in ("geometry", "class", "box_and_class", "strict")] == [
        163,
        151,
        133,
        99,
    ]
