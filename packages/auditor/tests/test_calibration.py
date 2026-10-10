import csv
import json
from pathlib import Path

import pytest
from auditor.eval import calibration
from auditor.eval.calibration import Point, points_for_item, reliability, summarise
from auditor.eval.units import ItemTruth
from auditor.schema import BBox, Finding


def finding(
    sc: str,
    box: tuple[float, float, float, float] | None,
    score: float,
    focus: int | None = None,
    tier: str = "automated",
) -> Finding:
    bbox = BBox(x=box[0], y=box[1], w=box[2], h=box[3]) if box else None
    return Finding(
        sc=sc, bbox=bbox, focus_index=focus, severity="minor", tier=tier,
        score=score, provenance="pixel", evidence={}, guidance_key="k",
    )  # fmt: skip


def truth() -> ItemTruth:
    t = ItemTruth("p1", "desktop", "synthetic", {"1.4.3", "2.4.7"})
    t.page_boxes = {"1.4.3": [BBox(x=10, y=10, w=100, h=20)]}
    t.stops = {0: {"2.4.7": True}, 1: {"2.4.7": False}}
    return t


def p(score: float, correct: bool, sc: str = "1.4.3", tier: str = "automated") -> Point:
    return Point("hybrid", "real", "p", sc, score, tier, "pixel", correct)


def test_page_findings_are_correct_when_they_overlap_a_truth_box_and_focus_findings_by_stop() -> (
    None
):
    fs = [
        finding("1.4.3", (12, 11, 98, 19), 0.9),
        finding("1.4.3", (500, 500, 10, 10), 0.8),
        finding("1.4.3", (20, 12, 10, 8), 0.7),
        finding("2.4.7", (0, 0, 5, 5), 0.6, 0),
        finding("2.4.7", (0, 0, 5, 5), 0.6, 1),
        finding("2.5.8", (0, 0, 24, 24), 0.9),
    ]
    pts = points_for_item(truth(), fs, "hybrid", 0.3, 0.5)
    assert sorted((x.sc, x.score, x.correct) for x in pts) == [
        ("1.4.3", 0.7, False), ("1.4.3", 0.8, False), ("1.4.3", 0.9, True),
        ("2.4.7", 0.6, False), ("2.4.7", 0.6, True),
    ]  # fmt: skip


def test_duplicates_on_a_claimed_box_and_findings_on_skipped_stops_are_handled_like_scoring() -> (
    None
):
    t = truth()
    dup = [finding("1.4.3", (12, 11, 98, 19), 0.9), finding("1.4.3", (14, 12, 90, 18), 0.8)]
    assert [x.correct for x in points_for_item(t, dup, "hybrid", 0.3, 0.5)] == [True, False]
    assert points_for_item(t, [finding("2.4.7", (0, 0, 5, 5), 0.6, 7)], "hybrid", 0.3, 0.5) == []
    zero = finding("1.4.3", (12, 11, 0, 0), 0.9)
    assert points_for_item(t, [zero], "hybrid", 0.3, 0.5) == []


def test_ece_and_brier_match_a_hand_computation() -> None:
    pts = [p(0.9, True), p(0.9, True), p(0.9, False), p(0.5, True), p(0.5, False), p(0.1, False)]
    r = reliability(pts)
    assert r["n"] == 6
    # bin 9: conf 0.9, acc 2/3; bin 5: conf 0.5, acc 0.5; bin 1: conf 0.1, acc 0
    expected = 3 / 6 * abs(2 / 3 - 0.9) + 2 / 6 * 0 + 1 / 6 * 0.1
    assert r["ece"] == pytest.approx(expected)
    assert r["brier"] == pytest.approx((0.01 + 0.01 + 0.81 + 0.25 + 0.25 + 0.01) / 6)
    assert [b["n"] for b in r["bins"]] == [0, 1, 0, 0, 0, 2, 0, 0, 0, 3]
    assert r["bins"][0]["accuracy"] is None


def test_a_score_of_exactly_one_falls_in_the_last_bin_and_empty_input_is_safe() -> None:
    assert reliability([p(1.0, True)])["bins"][-1]["n"] == 1
    empty = reliability([])
    assert empty["ece"] is None and empty["brier"] is None and empty["n"] == 0


def test_perfectly_calibrated_scores_have_zero_ece() -> None:
    pts = [p(0.75, True)] * 3 + [p(0.75, False)]
    assert reliability(pts)["ece"] == pytest.approx(0.0)


def test_summary_groups_by_condition_stratum_sc_and_tier(tmp_path: Path) -> None:
    pts = [
        p(0.9, True),
        p(0.4, False, "2.4.7", "needs-review"),
        Point("pixel", "synthetic", "q", "1.4.3", 0.8, "automated", "pixel", True),
    ]
    s = summarise(pts)
    assert set(s) == {"hybrid", "pixel"} and set(s["hybrid"]) == {"real", "combined"}
    assert s["hybrid"]["real"]["by_tier"]["needs-review"]["accuracy"] == 0.0
    assert set(s["hybrid"]["real"]["by_sc"]) == {"1.4.3", "2.4.7"}
    calibration.write(tmp_path, pts)
    rows = list(csv.DictReader((tmp_path / "calibration.csv").open()))
    assert len(rows) == 3 and list(rows[0]) == calibration.FIELDS
    assert json.loads((tmp_path / "calibration.json").read_text()).keys() == s.keys()
    assert "| hybrid | real | 2 |" in (tmp_path / "calibration.md").read_text()


def test_written_files_do_not_depend_on_input_order(tmp_path: Path) -> None:
    pts = [p(0.9, True), p(0.2, False), p(0.5, True)]
    a, b = tmp_path / "a", tmp_path / "b"
    a.mkdir()
    b.mkdir()
    calibration.write(a, pts)
    calibration.write(b, list(reversed(pts)))
    for name in ("calibration.csv", "calibration.json", "calibration.md"):
        assert (a / name).read_bytes() == (b / name).read_bytes()


@pytest.mark.browser
def test_the_harness_writes_calibration_files_only_when_asked(tmp_path: Path) -> None:
    from auditor.eval.harness import EvalConfig, run_eval

    fixtures = Path(__file__).resolve().parents[3] / "fixtures"
    for flag, name in ((True, "on"), (False, "off")):
        run_eval(
            EvalConfig(
                benchmark=fixtures,
                out=tmp_path / name,
                rule_findings=fixtures / "baseline_golden",
                conditions=["pixel", "hybrid"],
                bootstrap=20,
                calibration=flag,
            )
        )
    assert (tmp_path / "on" / "calibration.csv").is_file()
    assert not (tmp_path / "off" / "calibration.csv").exists()
    on = (tmp_path / "on" / "metrics.json").read_bytes()
    assert on == (tmp_path / "off" / "metrics.json").read_bytes()
    summary = json.loads((tmp_path / "on" / "calibration.json").read_text())
    assert summary["hybrid"]["synthetic"]["n"] > 0
