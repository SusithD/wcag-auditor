from __future__ import annotations

from dataclasses import dataclass

from auditor.fusion.tiers import best_verdict
from auditor.rules.rulemap import COVERED_SCS
from auditor.schema import Capture, Coverage, CoverageCell

SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]


@dataclass(frozen=True)
class Inputs:
    """What the pixel channel had to work with for one capture."""

    element_source: str
    has_geometry: bool
    has_detector: bool
    has_text_style: bool
    focus_stops: int


def rule_verdicts(ran: bool) -> dict[str, str]:
    return {sc: ("automated" if ran and sc in COVERED_SCS else "none") for sc in SCS}


def pixel_verdicts(inputs: Inputs) -> dict[str, str]:
    """Per-criterion verdict class from the inputs, before any finding is considered (RQ3):
    automated when the measurement is decisive, needs-review when it rests on OCR or detector
    boxes, not-assessable when the criterion has no input in this capture."""
    out = {sc: "not-assessable" for sc in SCS}
    out["1.4.3"] = "automated" if inputs.has_text_style else "needs-review"
    if inputs.has_geometry:
        out["1.4.11"] = "automated"
        out["2.5.8"] = "automated"
        out["2.5.7"] = "automated"
    elif inputs.has_detector:
        out["1.4.11"] = "needs-review"
        out["2.5.8"] = "needs-review"
    if inputs.focus_stops:
        out["2.4.7"] = "automated"
        out["2.4.13"] = "automated"
        out["2.4.11"] = "automated" if inputs.has_geometry else "needs-review"
        out["2.4.12"] = "automated" if inputs.has_geometry else "not-assessable"
    return out


def build_coverage(
    capture: Capture, condition: str, inputs: Inputs | None, rule_ran: bool
) -> Coverage:
    rules = rule_verdicts(rule_ran)
    pixel = pixel_verdicts(inputs) if inputs is not None else {sc: "none" for sc in SCS}
    cells = []
    for sc in SCS:
        hybrid = rules[sc] if condition == "rule_only" else best_verdict([rules[sc], pixel[sc]])
        cells.append(
            CoverageCell(
                viewport=capture.viewport,
                sc=sc,
                rule_verdict=rules[sc],
                pixel_verdict=pixel[sc],
                hybrid_verdict=hybrid,
            )
        )
    return Coverage(cells=cells)
