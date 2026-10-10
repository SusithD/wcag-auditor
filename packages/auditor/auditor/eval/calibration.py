from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from auditor.eval.units import FOCUS_SCS, PAGE_SCS, ItemTruth
from auditor.geometry import containment, iou
from auditor.schema import Finding

BINS = 10
FIELDS = ["condition", "stratum", "page_id", "sc", "score", "tier", "provenance", "correct"]


@dataclass(frozen=True)
class Point:
    condition: str
    stratum: str
    page_id: str
    sc: str
    score: float
    tier: str
    provenance: str
    correct: bool

    def row(self) -> dict[str, Any]:
        return {
            "condition": self.condition,
            "stratum": self.stratum,
            "page_id": self.page_id,
            "sc": self.sc,
            "score": f"{self.score:.4f}",
            "tier": self.tier,
            "provenance": self.provenance,
            "correct": int(self.correct),
        }


def points_for_item(
    truth: ItemTruth,
    findings: list[Finding],
    condition: str,
    iou_min: float,
    containment_min: float,
) -> list[Point]:
    """One point per finding on a criterion the item is scored on; a finding is correct when
    it lands on a ground-truth positive (page criteria: same overlap rule as scoring, focus
    criteria: the stop is positive)."""
    out: list[Point] = []
    for f in findings:
        if f.sc not in truth.scored_scs:
            continue
        if f.sc in FOCUS_SCS:
            if f.focus_index is None:
                continue
            correct = bool(truth.stops.get(f.focus_index, {}).get(f.sc, False))
        elif f.sc in PAGE_SCS and f.bbox is not None:
            correct = any(
                iou(f.bbox, t) >= iou_min
                or containment(f.bbox, t) >= containment_min
                or containment(t, f.bbox) >= containment_min
                for t in truth.page_boxes.get(f.sc, [])
            )
        else:
            continue
        out.append(
            Point(
                condition,
                truth.stratum,
                truth.page_id,
                f.sc,
                f.score,
                f.tier,
                f.provenance,
                correct,
            )
        )
    return out


def reliability(points: list[Point], bins: int = BINS) -> dict[str, Any]:
    """Equal-width bins on [0, 1]; ECE = sum_b n_b / N * |accuracy_b - mean score_b|."""
    n = len(points)
    table: list[dict[str, Any]] = []
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        members = [p for p in points if lo <= p.score < hi or (b == bins - 1 and p.score == 1.0)]
        if not members:
            table.append({"lo": lo, "hi": hi, "n": 0, "confidence": None, "accuracy": None})
            continue
        conf = sum(p.score for p in members) / len(members)
        acc = sum(p.correct for p in members) / len(members)
        ece += len(members) / n * abs(acc - conf)
        table.append({"lo": lo, "hi": hi, "n": len(members), "confidence": conf, "accuracy": acc})
    brier = sum((p.score - p.correct) ** 2 for p in points) / n if n else None
    return {
        "n": n,
        "ece": ece if n else None,
        "brier": brier,
        "accuracy": sum(p.correct for p in points) / n if n else None,
        "mean_score": sum(p.score for p in points) / n if n else None,
        "bins": table,
    }


def summarise(points: list[Point]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for condition in sorted({p.condition for p in points}):
        for stratum in (*sorted({p.stratum for p in points}), "combined"):
            sel = [
                p
                for p in points
                if p.condition == condition and (stratum == "combined" or p.stratum == stratum)
            ]
            if not sel:
                continue
            cell = reliability(sel)
            cell["by_sc"] = {
                sc: {
                    "n": len(g),
                    "accuracy": sum(p.correct for p in g) / len(g),
                    "mean_score": sum(p.score for p in g) / len(g),
                }
                for sc in sorted({p.sc for p in sel})
                for g in [[p for p in sel if p.sc == sc]]
            }
            cell["by_tier"] = {
                t: {
                    "n": len(g),
                    "accuracy": sum(p.correct for p in g) / len(g),
                    "mean_score": sum(p.score for p in g) / len(g),
                }
                for t in sorted({p.tier for p in sel})
                for g in [[p for p in sel if p.tier == t]]
            }
            out.setdefault(condition, {})[stratum] = cell
    return out


def markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Confidence calibration",
        "",
        "Module scores of every assessable finding (automated and needs-review tiers) against "
        "ground truth. A finding is correct when it lands on a labelled positive. ECE uses "
        "ten equal-width bins; Brier is the mean squared error of the score as a probability.",
        "",
        "| condition | stratum | findings | accuracy | mean score | ECE | Brier |",
        "|---|---|---|---|---|---|---|",
    ]
    for condition, strata in summary.items():
        for stratum, c in strata.items():
            lines.append(
                f"| {condition} | {stratum} | {c['n']} | {c['accuracy']:.3f} | "
                f"{c['mean_score']:.3f} | {c['ece']:.3f} | {c['brier']:.3f} |"
            )
    lines += [
        "",
        "## Accuracy by tier",
        "",
        "| condition | stratum | tier | findings | accuracy | mean score |",
        "|---|---|---|---|---|---|",
    ]
    for condition, strata in summary.items():
        for stratum, c in strata.items():
            for tier, t in c["by_tier"].items():
                lines.append(
                    f"| {condition} | {stratum} | {tier} | {t['n']} | {t['accuracy']:.3f} | "
                    f"{t['mean_score']:.3f} |"
                )
    return "\n".join(lines) + "\n"


def write(out: Path, points: list[Point]) -> dict[str, Any]:
    ordered = sorted(
        points, key=lambda p: (p.condition, p.stratum, p.page_id, p.sc, p.score, p.correct)
    )
    with (out / "calibration.csv").open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(p.row() for p in ordered)
    summary = summarise(ordered)
    (out / "calibration.json").write_text(json.dumps(summary, indent=1, sort_keys=True) + "\n")
    (out / "calibration.md").write_text(markdown(summary))
    return summary
