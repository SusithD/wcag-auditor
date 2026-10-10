import json
import shutil
from pathlib import Path

import pytest
from auditor.cli import app
from auditor.eval import tables
from auditor.eval.harness import EvalConfig, discover, run_eval
from typer.testing import CliRunner

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
GOLDEN = FIXTURES / "baseline_golden"


def cfg(out: Path, **kw: object) -> EvalConfig:
    return EvalConfig(benchmark=FIXTURES, out=out, rule_findings=GOLDEN, bootstrap=200, **kw)  # type: ignore[arg-type]


def test_discover_skips_support_directories() -> None:
    names = {p.name for p in discover(FIXTURES)}
    assert len(names) == 6 and not any(n in {"golden", "sites", "vectors"} for n in names)


def test_eval_on_fixtures_writes_metrics_with_shas_and_seed(tmp_path: Path) -> None:
    run_eval(cfg(tmp_path))
    metrics = json.loads((tmp_path / "metrics.json").read_text())
    meta = metrics["meta"]
    assert meta["seed"] == 20261004 and meta["bootstrap_resamples"] == 200
    for key in ("benchmark_sha", "truth_sha", "protocol_sha"):
        assert len(meta[key]) == 64
    assert meta["items_scored"] == 6 and meta["items_unlabelled"] == 0
    synthetic = metrics["metrics"]["rule_only"]["synthetic"]
    assert synthetic["2.5.8"]["tp"] == 4 and synthetic["2.5.8"]["fn"] == 0
    assert synthetic["1.4.3"]["tp"] == 1
    assert (tmp_path / "tables.md").is_file() and (tmp_path / "tables.tex").is_file()
    assert (tmp_path / "failures.csv").read_text().startswith("page_id,viewport")
    assert (tmp_path / "sensitivity.csv").read_text().startswith("rule,iou,condition")


def test_metrics_json_is_reproducible(tmp_path: Path) -> None:
    run_eval(cfg(tmp_path / "a"))
    run_eval(cfg(tmp_path / "b"))
    assert (tmp_path / "a" / "metrics.json").read_bytes() == (
        tmp_path / "b" / "metrics.json"
    ).read_bytes()


def test_real_focus_truth_makes_rule_only_miss_every_positive_stop(tmp_path: Path) -> None:
    metrics = run_eval(cfg(tmp_path))
    cell = metrics["metrics"]["rule_only"]["real"]["2.4.13"]
    assert cell["tp"] == 0 and cell["fp"] == 0 and cell["fn"] > 0 and cell["tn"] > 0


def test_unknown_condition_exits_with_code_2(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        app,
        [
            "eval",
            "--benchmark",
            str(FIXTURES),
            "--out",
            str(tmp_path),
            "--conditions",
            "hybrid",
            "--rule-findings",
            str(GOLDEN),
            "--bootstrap",
            "10",
        ],
    )
    assert result.exit_code == 2


def test_cli_eval_prints_table_and_writes_metrics(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        app,
        [
            "eval",
            "--benchmark",
            str(FIXTURES),
            "--out",
            str(tmp_path),
            "--rule-findings",
            str(GOLDEN),
            "--bootstrap",
            "50",
        ],
    )
    assert result.exit_code == 0, result.output
    assert "rule_only / combined" in result.output and "metrics.json" in result.output


def test_tables_render_markdown_and_latex(tmp_path: Path) -> None:
    metrics = run_eval(cfg(tmp_path))
    md, tex = tables.markdown(metrics), tables.latex(metrics)
    assert "## rule_only, real" in md and "| 1.4.3 |" in md
    assert "\\begin{tabular}" in tex and "\\hline" in tex


def test_missing_truth_file_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        run_eval(cfg(tmp_path, truth=tmp_path / "nope.json"))


def test_empty_benchmark_scores_nothing_without_crashing(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    metrics = run_eval(
        EvalConfig(benchmark=empty, out=tmp_path / "o", rule_findings=GOLDEN, bootstrap=10)
    )
    assert metrics["meta"]["items_scored"] == 0 and metrics["metrics"] == {}


def test_item_without_truth_is_counted_as_unlabelled(tmp_path: Path) -> None:
    bench = tmp_path / "bench"
    src = next(FIXTURES.glob("real/real_com_003_desktop_*"))
    shutil.copytree(src, bench / src.name)
    (bench / src.name / "truth.json").unlink()
    metrics = run_eval(
        EvalConfig(benchmark=bench, out=tmp_path / "o", rule_findings=GOLDEN, bootstrap=10)
    )
    assert metrics["meta"]["items_scored"] == 0 and metrics["meta"]["items_unlabelled"] == 1


def test_needs_review_findings_are_excluded_unless_requested(tmp_path: Path) -> None:
    bench = tmp_path / "bench"
    src = next(FIXTURES.glob("synth/sc2-5-8/*"))
    shutil.copytree(src, bench / src.name)
    findings = tmp_path / "rf"
    findings.mkdir()
    raw = json.loads((GOLDEN / f"{src.name}.json").read_text())
    extra = {
        "sc": "2.5.8",
        "rule": "target-size",
        "kind": "needs-review",
        "impact": "serious",
        "bbox": {"x": 900, "y": 900, "w": 5, "h": 5},
        "target": ["x"],
        "summary": "",
    }
    raw["findings"].append(extra)
    (findings / f"{src.name}.json").write_text(json.dumps(raw))
    base = EvalConfig(benchmark=bench, out=tmp_path / "a", rule_findings=findings, bootstrap=10)
    without = run_eval(base)
    with_nr = run_eval(
        EvalConfig(
            benchmark=bench,
            out=tmp_path / "b",
            rule_findings=findings,
            bootstrap=10,
            include_needs_review=True,
        )
    )
    assert without["metrics"]["rule_only"]["synthetic"]["2.5.8"]["fp"] == 0
    assert with_nr["metrics"]["rule_only"]["synthetic"]["2.5.8"]["fp"] == 1
    assert without["meta"]["rule_findings_dropped"]["needs_review_excluded"] == 1


def test_metrics_json_does_not_embed_the_git_sha(tmp_path: Path) -> None:
    run_eval(cfg(tmp_path))
    assert "git_sha" not in (tmp_path / "metrics.json").read_text()
    assert "git_sha" in (tmp_path / "VERSIONS.json").read_text()


@pytest.mark.browser
def test_live_axe_scores_the_same_as_the_golden_findings(tmp_path: Path) -> None:
    golden = run_eval(cfg(tmp_path / "golden"))
    live = run_eval(EvalConfig(benchmark=FIXTURES, out=tmp_path / "live", bootstrap=200))
    assert live["metrics"] == golden["metrics"]
    assert (tmp_path / "live" / "sensitivity.csv").read_text() == (
        tmp_path / "golden" / "sensitivity.csv"
    ).read_text()


@pytest.mark.browser
def test_pixel_condition_scores_the_synthetic_fixtures(tmp_path: Path) -> None:
    metrics = run_eval(
        EvalConfig(benchmark=FIXTURES, out=tmp_path, conditions=["pixel"], bootstrap=50)
    )
    synthetic = metrics["metrics"]["pixel"]["synthetic"]
    assert (synthetic["1.4.3"]["tp"], synthetic["1.4.3"]["fp"], synthetic["1.4.3"]["fn"]) == (
        1,
        0,
        0,
    )
    assert (synthetic["2.5.8"]["tp"], synthetic["2.5.8"]["fp"], synthetic["2.5.8"]["fn"]) == (
        4,
        0,
        0,
    )
    cell = synthetic["1.4.11"]
    assert (cell["tp"], cell["fp"], cell["fn"]) == (2, 0, 0)
    assert metrics["meta"]["pixel_captures_without_geometry"] == 2


def test_pixel_and_rule_conditions_are_both_supported_names(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        app,
        [
            "eval",
            "--benchmark",
            str(tmp_path),
            "--out",
            str(tmp_path / "o"),
            "--conditions",
            "bogus",
        ],
    )
    assert result.exit_code == 2
