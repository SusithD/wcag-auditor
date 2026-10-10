# ruff: noqa: E501
import csv
from pathlib import Path
from typing import Any

import pytest
from auditor.eval import tables
from auditor.eval.harness import EvalConfig, run_eval

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
GOLDEN = FIXTURES / "baseline_golden"
STRATA = ("real", "synthetic", "combined")


def cell(precision: float | None, recall: float | None) -> dict[str, Any]:
    return {
        "tp": 3, "fp": 1, "fn": 2, "duplicates": 0, "tn": 0, "units": 6,
        "precision": precision, "recall": recall, "f1": None if precision is None else 0.5,
    }  # fmt: skip


def metrics() -> dict[str, Any]:
    cells = {sc: cell(0.75, 0.6) for sc in ("1.4.3", "2.4.7")}
    cells["2.4.7"] = cell(None, 0.0)
    ci = {
        "precision": {"low": 0.5, "high": 0.9},
        "recall": {"low": 0.2, "high": 0.8},
        "f1": {"low": 0.3, "high": 0.7},
    }
    return {
        "metrics": {c: {s: dict(cells) for s in STRATA} for c in ("hybrid", "rule_only")},
        "bootstrap": {
            "ci": {c: {s: {"1.4.3": ci} for s in STRATA} for c in ("hybrid", "rule_only")},
            "delta_precision": {
                s: {
                    "1.4.3": {"low": -0.031, "high": -0.005, "margin": -0.05, "non_inferior": True},
                    "2.4.7": {"low": None, "high": None, "margin": -0.05, "non_inferior": None},
                }
                for s in STRATA
            },
        },
        "mcnemar": {
            "a": "hybrid",
            "b": "rule_only",
            "tests": {
                s: {
                    "1.4.3": {"both_correct": 5, "only_a_correct": 0, "only_b_correct": 4, "both_wrong": 1, "p_value": 0.125},
                    "2.4.7": {"both_correct": 5, "only_a_correct": 0, "only_b_correct": 0, "both_wrong": 1, "p_value": None},
                }
                for s in STRATA
            },
            "bh_adjusted": {s: {"1.4.3": 0.125} for s in STRATA},
        },
        "coverage": {"rule_only": {"scs_with_verdict": 2, "scs": ["1.4.3", "2.5.8"]}},
    }  # fmt: skip


def test_markdown_has_every_condition_and_stratum_with_cis_and_na() -> None:
    md = tables.markdown(metrics())
    for cond in ("hybrid", "rule_only"):
        for stratum in STRATA:
            assert f"## {cond}, {stratum}" in md
    assert "| 1.4.3 | 3 | 1 | 2 | 0 | 0.750 [0.50, 0.90] | 0.600 [0.20, 0.80] |" in md
    assert "| 2.4.7 | 3 | 1 | 2 | 0 | n/a | 0.000 |" in md


def test_markdown_has_the_paired_table_with_degenerate_rows_and_delta_precision_cis() -> None:
    md = tables.markdown(metrics())
    for stratum in STRATA:
        assert f"## McNemar, A = hybrid against B = rule_only, {stratum}" in md
    row143 = "| 1.4.3 | 0 | 4 | 5 | 1 | 0.125 | 0.125 | [-0.031, -0.005] | yes |"
    row247 = (
        "| 2.4.7 | 0 | 0 | 5 | 1 | degenerate: no discordant pairs | n/a | not estimable | n/a |"
    )
    assert row143 in md and row247 in md


def test_latex_has_the_paired_tables_too() -> None:
    tex = tables.latex(metrics())
    assert tex.count("\\begin{tabular}") == 6 + 3
    assert "degenerate: no discordant pairs" in tex and "[-0.031, -0.005]" in tex


def test_a_single_condition_run_has_no_paired_section() -> None:
    m = metrics()
    m["mcnemar"] = {"note": "single condition: no paired comparison"}
    assert "McNemar" not in tables.markdown(m)


@pytest.mark.browser
def test_full_outputs_for_both_conditions_meet_the_acceptance_listing(tmp_path: Path) -> None:
    run_eval(
        EvalConfig(
            benchmark=FIXTURES,
            out=tmp_path,
            rule_findings=GOLDEN,
            conditions=["hybrid", "rule_only"],
            bootstrap=50,
        )
    )
    md = (tmp_path / "tables.md").read_text()
    for cond in ("hybrid", "rule_only"):
        for stratum in STRATA:
            assert f"## {cond}, {stratum}" in md
    assert "## McNemar, A = hybrid against B = rule_only, combined" in md
    assert "degenerate: no discordant pairs" in md and "dPrecision 95% CI" in md
    sweep = list(csv.DictReader((tmp_path / "sensitivity.csv").open()))
    assert sorted({float(r["iou"]) for r in sweep}) == [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]
    assert {r["rule"] for r in sweep} == {"iou-only", "iou-or-containment"}
    failures = list(csv.DictReader((tmp_path / "failures.csv").open()))
    assert failures and all("page_features" in r for r in failures)
    assert any(r["page_features"] not in {"", "{}"} for r in failures)
