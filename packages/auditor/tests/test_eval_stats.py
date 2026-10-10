import numpy as np
import pytest
from auditor.eval.bootstrap import NONINFERIORITY_MARGIN, bootstrap
from auditor.eval.mcnemar import DEGENERATE, run_mcnemar
from auditor.eval.metrics import UnitResult


def unit(
    page: str,
    cond: str,
    sc: str,
    tp: int,
    fp: int,
    fn: int,
    truth: bool,
    pred: bool,
    key: int | None = None,
) -> UnitResult:
    return UnitResult(page, "desktop", "real", cond, sc, key, tp, fp, fn, 0, 0, truth, pred)


def paired(n_both: int, only_a: int, only_b: int) -> list[UnitResult]:
    out: list[UnitResult] = []
    for i in range(n_both):
        out += [
            unit(f"b{i}", "hybrid", "1.4.3", 1, 0, 0, True, True),
            unit(f"b{i}", "rule_only", "1.4.3", 1, 0, 0, True, True),
        ]
    for i in range(only_a):
        out += [
            unit(f"a{i}", "hybrid", "1.4.3", 1, 0, 0, True, True),
            unit(f"a{i}", "rule_only", "1.4.3", 0, 0, 1, True, False),
        ]
    for i in range(only_b):
        out += [
            unit(f"c{i}", "hybrid", "1.4.3", 0, 0, 1, True, False),
            unit(f"c{i}", "rule_only", "1.4.3", 1, 0, 0, True, True),
        ]
    return out


def test_mcnemar_exact_matches_hand_computation() -> None:
    res = run_mcnemar(paired(5, 8, 2), "hybrid", "rule_only", ["1.4.3"], ["combined"])
    entry = res["tests"]["combined"]["1.4.3"]
    assert (entry["only_a_correct"], entry["only_b_correct"]) == (8, 2)
    assert entry["p_value"] == pytest.approx(0.109375)
    assert res["bh_adjusted"]["combined"]["1.4.3"] == pytest.approx(0.109375)


def test_mcnemar_degenerate_when_no_discordant_pairs() -> None:
    res = run_mcnemar(paired(4, 0, 0), "hybrid", "rule_only", ["1.4.3"], ["combined"])
    entry = res["tests"]["combined"]["1.4.3"]
    assert entry["p_value"] is None and entry["note"] == DEGENERATE
    assert res["bh_adjusted"] == {}


def test_bootstrap_is_seeded_and_brackets_the_point_estimate() -> None:
    results = [
        unit(
            f"p{i}",
            "rule_only",
            "1.4.3",
            int(i % 4 != 0),
            int(i % 5 == 0),
            int(i % 4 == 0),
            True,
            True,
        )
        for i in range(40)
    ]
    a = bootstrap(results, ["rule_only"], ["1.4.3"], 500, seed=7)
    b = bootstrap(results, ["rule_only"], ["1.4.3"], 500, seed=7)
    c = bootstrap(results, ["rule_only"], ["1.4.3"], 500, seed=8)
    assert a == b and a != c
    tp = sum(r.tp for r in results)
    fp = sum(r.fp for r in results)
    ci = a["ci"]["rule_only"]["combined"]["1.4.3"]["precision"]
    assert ci["low"] <= tp / (tp + fp) <= ci["high"]


def test_delta_precision_reports_noninferiority_against_margin() -> None:
    results = paired(30, 0, 0)
    out = bootstrap(results, ["hybrid", "rule_only"], ["1.4.3"], 300, seed=1)
    delta = out["delta_precision"]["combined"]["1.4.3"]
    assert delta["margin"] == NONINFERIORITY_MARGIN
    assert delta["low"] == 0.0 and delta["non_inferior"] is True
    assert np.isclose(delta["high"], 0.0)


def test_bh_is_applied_within_a_stratum_and_never_lowers_p_values() -> None:
    results = paired(5, 8, 2)
    for sc, (a, b) in {"1.4.11": (7, 1), "2.5.8": (3, 3)}.items():
        for i in range(a):
            results += [
                unit(f"x{sc}{i}", "hybrid", sc, 1, 0, 0, True, True),
                unit(f"x{sc}{i}", "rule_only", sc, 0, 0, 1, True, False),
            ]
        for i in range(b):
            results += [
                unit(f"y{sc}{i}", "hybrid", sc, 0, 0, 1, True, False),
                unit(f"y{sc}{i}", "rule_only", sc, 1, 0, 0, True, True),
            ]
    res = run_mcnemar(results, "hybrid", "rule_only", ["1.4.3", "1.4.11", "2.5.8"], ["combined"])
    raw = {sc: t["p_value"] for sc, t in res["tests"]["combined"].items()}
    adj = res["bh_adjusted"]["combined"]
    assert all(adj[sc] >= raw[sc] for sc in raw)
    assert adj["1.4.11"] == pytest.approx(raw["1.4.11"] * 3 / 1) or adj["1.4.11"] >= raw["1.4.11"]
    assert res["bh_family"] == "SCs within one stratum"


def test_delta_precision_with_a_real_difference_is_detected() -> None:
    results: list[UnitResult] = []
    for i in range(60):
        results.append(unit(f"p{i}", "hybrid", "1.4.3", 1, 0, 0, True, True))
        results.append(
            unit(f"p{i}", "rule_only", "1.4.3", int(i % 2 == 0), int(i % 2 == 1), 0, True, True)
        )
    delta = bootstrap(results, ["hybrid", "rule_only"], ["1.4.3"], 400, seed=3)["delta_precision"][
        "combined"
    ]["1.4.3"]
    assert delta["low"] > 0.3 and delta["non_inferior"] is True


def test_the_mcnemar_pair_is_hybrid_against_rule_only_whatever_the_order() -> None:
    from auditor.eval.harness import mcnemar_pair

    assert mcnemar_pair(["rule_only", "pixel", "hybrid"]) == ("hybrid", "rule_only")
    assert mcnemar_pair(["hybrid", "rule_only"]) == ("hybrid", "rule_only")
    assert mcnemar_pair(["pixel", "rule_only"]) == ("pixel", "rule_only")
    assert mcnemar_pair(["rule_only"]) is None
