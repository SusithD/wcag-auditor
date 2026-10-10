import pytest
from auditor.eval.match import match_boxes
from auditor.eval.metrics import MatchConfig, aggregate, prf, score_item
from auditor.eval.units import ItemTruth, Prediction
from auditor.schema import BBox

CFG = MatchConfig(iou=0.3, containment=0.5, use_containment=True)


def box(x: float, y: float, w: float, h: float) -> BBox:
    return BBox(x=x, y=y, w=w, h=h)


def test_adr013_block_truth_merges_line_findings_into_one_tp() -> None:
    truth = [box(80, 200, 640, 60)]
    findings = [box(96, 217, 437, 16), box(96, 237, 300, 16)]
    m = match_boxes(findings, truth, 0.3, 0.5, True)
    assert (m.tp, m.fp, m.fn, m.duplicates) == (1, 0, 0, 1)


def test_iou_only_mode_rejects_the_same_block_pair() -> None:
    m = match_boxes([box(96, 217, 437, 16)], [box(80, 200, 640, 60)], 0.3, 0.5, False)
    assert (m.tp, m.fp, m.fn) == (0, 1, 1)


def test_unmatched_finding_is_fp_and_unmatched_truth_is_fn() -> None:
    m = match_boxes(
        [box(0, 0, 10, 10), box(500, 500, 10, 10)], [box(0, 0, 10, 10), box(900, 0, 5, 5)], 0.3, 0.5
    )
    assert (m.tp, m.fp, m.fn, m.duplicates) == (1, 1, 1, 0)


def test_toy_truth_hand_computed_precision_recall() -> None:
    page_a = ItemTruth(
        "a", "desktop", "real", {"1.4.3"}, {"1.4.3": [box(0, 0, 10, 10), box(50, 0, 10, 10)]}
    )
    pred_a = Prediction({"1.4.3": [box(0, 0, 10, 10), box(50, 0, 10, 10), box(200, 0, 10, 10)]})
    page_b = ItemTruth("b", "desktop", "real", {"1.4.3"}, {"1.4.3": [box(0, 0, 10, 10)]})
    results = score_item(page_a, pred_a, "rule_only", CFG) + score_item(
        page_b, Prediction(), "rule_only", CFG
    )
    cell = aggregate(results)["rule_only"]["real"]["1.4.3"]
    assert (cell["tp"], cell["fp"], cell["fn"]) == (2, 1, 1)
    assert cell["precision"] == pytest.approx(2 / 3)
    assert cell["recall"] == pytest.approx(2 / 3)
    assert cell["f1"] == pytest.approx(2 / 3)


def test_focus_stop_units_by_index() -> None:
    truth = ItemTruth(
        "p",
        "desktop",
        "real",
        {"2.4.7"},
        stops={0: {"2.4.7": False}, 1: {"2.4.7": True}, 2: {"2.4.7": True}, 3: {"2.4.7": False}},
    )
    pred = Prediction(stops={"2.4.7": {1, 3}})
    results = score_item(truth, pred, "hybrid", CFG)
    by_stop = {r.key: (r.tp, r.fp, r.fn, r.tn) for r in results}
    assert by_stop == {0: (0, 0, 0, 1), 1: (1, 0, 0, 0), 2: (0, 0, 1, 0), 3: (0, 1, 0, 0)}
    cell = aggregate(results)["hybrid"]["real"]["2.4.7"]
    assert (cell["tp"], cell["fp"], cell["fn"], cell["tn"]) == (1, 1, 1, 1)
    assert cell["precision"] == 0.5 and cell["recall"] == 0.5


def test_sc_outside_scored_set_is_not_scored() -> None:
    truth = ItemTruth("s", "desktop", "synthetic", {"2.5.8"}, {"1.4.3": [box(0, 0, 5, 5)]})
    assert {r.sc for r in score_item(truth, Prediction(), "rule_only", CFG)} == {"2.5.8"}


def test_prf_handles_empty_denominators() -> None:
    assert prf(0, 0, 0) == {"precision": None, "recall": None, "f1": None}
    assert prf(0, 0, 3)["recall"] == 0.0


def test_iou_threshold_is_inclusive() -> None:
    truth = [box(0, 0, 10, 10)]
    assert match_boxes([box(0, 0, 3, 10)], truth, 0.3, 0.5, False).tp == 1
    assert match_boxes([box(0, 0, 2.9, 10)], truth, 0.3, 0.5, False).tp == 0


def test_containment_threshold_is_inclusive() -> None:
    truth = [box(5, 0, 10, 10)]
    assert match_boxes([box(0, 0, 10, 10)], truth, 0.9, 0.5, True).tp == 1
    assert match_boxes([box(0, 0, 9.8, 10)], truth, 0.9, 0.5, True).tp == 0


def test_one_finding_can_cover_two_truth_boxes() -> None:
    m = match_boxes([box(2, 0, 8, 10)], [box(0, 0, 10, 10), box(2, 0, 10, 10)], 0.9, 0.5)
    assert (m.tp, m.fp, m.fn, m.duplicates) == (2, 0, 0, 0)


def test_page_units_count_true_negatives_and_correctness_follows_counts() -> None:
    clean = ItemTruth("c", "desktop", "synthetic", {"2.5.8"})
    (unit,) = score_item(clean, Prediction(), "rule_only", CFG)
    assert unit.tn == 1 and unit.correct
    wrong = ItemTruth("w", "desktop", "synthetic", {"2.5.8"}, {"2.5.8": [box(0, 0, 10, 10)]})
    pred = Prediction({"2.5.8": [box(500, 500, 10, 10)]})
    (bad,) = score_item(wrong, pred, "rule_only", CFG)
    assert (bad.tp, bad.fp, bad.fn) == (0, 1, 1) and not bad.correct
