# ruff: noqa: E501
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))

SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]


def write_inputs(d: Path) -> None:
    d.mkdir(parents=True, exist_ok=True)
    cells: dict[str, dict[str, float | None]] = {
        sc: {"f1": 0.5, "precision": 0.5, "recall": 0.5} for sc in SCS
    }
    cells["2.5.7"] = {"f1": None, "precision": None, "recall": None}
    ci: dict[str, dict[str, dict[str, float | None]]] = {
        sc: {"f1": {"low": 0.3, "high": 0.7}} for sc in SCS
    }
    ci["2.5.7"] = {"f1": {"low": None, "high": None}}
    metrics = {
        "metrics": {
            c: {s: cells for s in ("real", "synthetic", "combined")}
            for c in ("hybrid", "rule_only")
        },
        "bootstrap": {
            "ci": {
                c: {s: ci for s in ("real", "synthetic", "combined")}
                for c in ("hybrid", "rule_only")
            }
        },
    }
    (d / "metrics.json").write_text(json.dumps(metrics))
    with (d / "sensitivity.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(
            [
                "rule",
                "iou",
                "condition",
                "sc",
                "tp",
                "fp",
                "fn",
                "duplicates",
                "precision",
                "recall",
            ]
        )
        for rule in ("iou-only", "iou-or-containment"):
            for iou in (0.1, 0.3, 0.7):
                for cond in ("hybrid", "rule_only"):
                    w.writerow([rule, iou, cond, "1.4.3", 5, 1, 1, 0, "0.8", "0.7"])
    with (d / "failures.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(
            [
                "page_id",
                "viewport",
                "stratum",
                "condition",
                "sc",
                "focus_index",
                "type",
                "bbox",
                "page_features",
            ]
        )
        feat = json.dumps({"is_non_responsive": False, "sector": "com"})
        w.writerow(["p1", "desktop", "real", "hybrid", "1.4.3", "", "FN", "{}", feat])
        w.writerow(["p2", "desktop", "real", "hybrid", "1.4.3", "", "FP", "{}", feat])
        w.writerow(["p3", "desktop", "synthetic", "rule_only", "2.4.7", "1", "FN", "", ""])


def test_figures_are_written_small_and_byte_identical_across_runs(tmp_path: Path) -> None:
    import eval_figure  # type: ignore[import-not-found]

    outputs = []
    for run in ("a", "b"):
        d = tmp_path / run
        write_inputs(d)
        files = [*eval_figure.sensitivity(d), *eval_figure.per_sc(d)]
        assert [f.name for f in files] == [
            "sensitivity.svg", "sensitivity.pdf", "f1_by_sc.svg", "f1_by_sc.pdf",
        ]  # fmt: skip
        outputs.append({f.name: f.read_bytes() for f in files})
    assert outputs[0] == outputs[1]
    assert all(1000 < len(b) < 200_000 for b in outputs[0].values())
    svg = outputs[0]["sensitivity.svg"].decode()
    assert "keyed by focus stop" in svg and "IoU threshold" in svg


def test_failure_taxonomy_counts_and_feature_rows(tmp_path: Path) -> None:
    import failure_taxonomy  # type: ignore[import-not-found]

    write_inputs(tmp_path)
    text = failure_taxonomy.main(tmp_path).read_text()
    assert "| 1.4.3 | 1 | 1 | 0 | 0 |" in text
    assert "| 2.4.7 | 0 | 0 | 0 | 1 |" in text
    assert "| non-responsive | False | 1 | 1 |" in text and "| sector | com | 1 | 1 |" in text
    assert "### hybrid: real-stratum failures by page feature" in text
