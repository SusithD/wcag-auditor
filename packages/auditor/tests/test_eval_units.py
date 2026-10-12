import json
from pathlib import Path

from auditor.eval.metrics import MatchConfig, score_item
from auditor.eval.units import (
    ItemTruth,
    Prediction,
    real_truth,
    stop_truth,
    synthetic_truth,
)
from auditor.geometry import containment, iou
from auditor.schema import BBox, Capture

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
CFG = MatchConfig(0.3, 0.5, True)


def box(x: float, y: float, w: float, h: float) -> BBox:
    return BBox(x=x, y=y, w=w, h=h)


def test_iou_hand_computed() -> None:
    assert iou(box(0, 0, 10, 10), box(5, 0, 10, 10)) == 50 / 150
    assert iou(box(0, 0, 10, 10), box(20, 20, 5, 5)) == 0.0
    assert iou(box(0, 0, 0, 0), box(0, 0, 0, 0)) == 0.0


def test_containment_is_share_of_the_inner_boxs_own_area() -> None:
    assert containment(box(10, 10, 20, 10), box(0, 0, 640, 60)) == 1.0
    assert containment(box(0, 0, 10, 10), box(5, 0, 10, 10)) == 0.5
    assert containment(box(0, 0, 0, 0), box(0, 0, 10, 10)) == 0.0


def test_stop_truth_follows_agreement_rules() -> None:
    assert stop_truth({"v247": "no", "obs": "none", "v2413": "na"}) == {
        "2.4.7": True,
        "2.4.11": False,
        "2.4.12": False,
        "2.4.13": False,
    }
    assert stop_truth({"v247": "yes", "obs": "partial", "v2413": "fails"}) == {
        "2.4.7": False,
        "2.4.11": False,
        "2.4.12": True,
        "2.4.13": True,
    }


def test_r6_not_assessable_leaves_247_and_2413_out_but_keeps_obscured() -> None:
    got = stop_truth({"v247": "not-assessable", "obs": "entire", "v2413": "not-assessable"})
    assert got == {"2.4.11": True, "2.4.12": True}


def test_excluded_stops_are_dropped() -> None:
    item = {
        "page_id": "p1",
        "viewport": "desktop",
        "annotations": [{"sc": "1.4.3", "bbox": {"x": 0, "y": 0, "w": 5, "h": 5}}],
        "focus_judgments": [
            {"index": 0, "v247": "yes", "obs": "none", "v2413": "meets"},
            {"index": 1, "v247": "no", "obs": "none", "v2413": "na"},
        ],
    }
    truth = real_truth(item, {"p1#1"})
    assert sorted(truth.stops) == [0]
    assert len(truth.page_boxes["1.4.3"]) == 1


def test_synthetic_focus_truth_maps_annotation_to_the_matching_stop() -> None:
    folder = min(FIXTURES.glob("synth/sc2-4-13/*"))
    capture = Capture.from_folder(folder)
    truth = synthetic_truth(capture, json.loads((folder / "truth.json").read_text()))
    assert truth.scored_scs == {"2.4.13"} and truth.stratum == "synthetic"
    assert truth.stops == {0: {"2.4.7": False, "2.4.11": False, "2.4.12": False, "2.4.13": True}}


def test_synthetic_page_truth_scores_only_the_seeded_sc() -> None:
    folder = min(FIXTURES.glob("synth/sc1-4-3/*"))
    capture = Capture.from_folder(folder)
    truth = synthetic_truth(capture, json.loads((folder / "truth.json").read_text()))
    assert truth.scored_scs == {"1.4.3"} and len(truth.page_boxes["1.4.3"]) == 1
    assert truth.stops == {}


def test_r6_not_assessable_stop_is_absent_from_scored_units() -> None:
    item = {
        "page_id": "p",
        "viewport": "desktop",
        "annotations": [],
        "focus_judgments": [
            {"index": 0, "v247": "not-assessable", "obs": "entire", "v2413": "not-assessable"}
        ],
    }
    truth = real_truth(item, set())
    scored = {
        (r.sc, r.key)
        for r in score_item(truth, Prediction(), "rule_only", CFG)
        if r.key is not None
    }
    assert scored == {("2.4.11", 0), ("2.4.12", 0)}


def test_focus_truth_for_2411_2412_2413_reaches_scoring_and_ignores_unknown_indices() -> None:
    truth = ItemTruth(
        "p",
        "desktop",
        "real",
        {"2.4.11", "2.4.12", "2.4.13"},
        stops={
            0: {"2.4.11": False, "2.4.12": True, "2.4.13": True},
            1: {"2.4.11": True, "2.4.12": True, "2.4.13": False},
        },
    )
    pred = Prediction(stops={"2.4.12": {0, 1, 99}, "2.4.13": {1}, "2.4.11": {1}})
    got = {(r.sc, r.key): (r.tp, r.fp, r.fn, r.tn) for r in score_item(truth, pred, "hybrid", CFG)}
    assert got[("2.4.12", 0)] == (1, 0, 0, 0) and got[("2.4.12", 1)] == (1, 0, 0, 0)
    assert got[("2.4.13", 0)] == (0, 0, 1, 0) and got[("2.4.13", 1)] == (0, 1, 0, 0)
    assert got[("2.4.11", 1)] == (1, 0, 0, 0) and got[("2.4.11", 0)] == (0, 0, 0, 1)
    assert not any(key == 99 for _, key in got)
