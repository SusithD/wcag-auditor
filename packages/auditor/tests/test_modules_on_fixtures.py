import json
from pathlib import Path

import pytest
from auditor.elements.base import Element
from auditor.eval.metrics import MatchConfig, aggregate, score_item
from auditor.eval.units import Prediction, synthetic_truth
from auditor.modules import MODULES, ModuleContext
from auditor.protocol import load
from auditor.schema import Capture

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
GOLDEN = FIXTURES / "golden" / "elements"
SYNTHETIC = sorted(p.parent for p in FIXTURES.glob("synth/*/*/meta.json"))
POSITIVES = {
    "1.4.3": 1,
    "1.4.11": 2,
    "2.4.7": 1,
    "2.4.11": 1,
    "2.4.12": 2,
    "2.4.13": 1,
    "2.5.7": 1,
    "2.5.8": 4,
}


def predict(capture: Capture, elements: list[Element]) -> Prediction:
    ctx = ModuleContext.load(capture, elements, has_geometry=True)
    pred = Prediction()
    for sc, run in MODULES.items():
        for f in run(ctx):
            if f.tier != "automated":
                continue
            if f.focus_index is not None:
                pred.stops.setdefault(sc, set()).add(f.focus_index)
            elif f.bbox is not None:
                pred.page_boxes.setdefault(sc, []).append(f.bbox)
    return pred


def results_for(folder: Path):  # type: ignore[no-untyped-def]
    capture = Capture.from_folder(folder)
    golden = json.loads((GOLDEN / f"{folder.name}.json").read_text())
    elements = [Element.model_validate(e) for e in golden["elements"]]
    truth = synthetic_truth(capture, json.loads((folder / "truth.json").read_text()))
    p = load().thresholds.match
    return score_item(truth, predict(capture, elements), "pixel", MatchConfig(p.iou, p.containment))


def test_there_is_a_fixture_for_every_synthetic_criterion() -> None:
    scored = {
        sc
        for folder in SYNTHETIC
        for sc in synthetic_truth(
            Capture.from_folder(folder), json.loads((folder / "truth.json").read_text())
        ).scored_scs
    }
    assert scored == set(POSITIVES)


def test_modules_reproduce_the_truth_on_every_synthetic_fixture_without_a_browser() -> None:
    results = [r for folder in SYNTHETIC for r in results_for(folder)]
    cells = aggregate(results)["pixel"]["synthetic"]
    for sc, positives in POSITIVES.items():
        cell = cells[sc]
        assert (cell["tp"], cell["fp"], cell["fn"]) == (positives, 0, 0), sc
        assert cell["precision"] == 1.0 and cell["recall"] == 1.0


@pytest.mark.parametrize("folder", SYNTHETIC, ids=lambda p: p.name[6:24])
def test_each_fixture_is_clean_except_for_its_seeded_violation(folder: Path) -> None:
    for r in results_for(folder):
        assert r.fp == 0 and r.fn == 0
