from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from auditor.eval.units import SCS

STRATA = ("real", "synthetic")


def _cell(metrics: dict[str, Any], stratum: str, sc: str) -> dict[str, Any] | None:
    cond = metrics["metrics"].get("pixel", {})
    cell: dict[str, Any] | None = cond.get(stratum, {}).get(sc)
    return cell


def _fmt(v: float | None) -> str:
    return "n/a" if v is None else f"{v:.3f}"


def table(dom: dict[str, Any], detector: dict[str, Any]) -> str:
    """Module precision/recall per SC with DOM boxes versus detector boxes, per stratum."""
    lines = ["# Element-source ablation: DOM boxes vs detector boxes", ""]
    for key in ("benchmark_sha", "protocol_sha"):
        lines.append(f"- {key}: {dom['meta'][key]}")
    lines += [
        f"- detector loaded in the detector run: {detector['meta'].get('detector_loaded')}",
        "- the DOM source has no geometry for the benchmark's real pages (ADR-012), so the "
        "real-stratum DOM cells reflect OCR-only boxes there",
        "",
    ]
    for stratum in STRATA:
        lines += [
            f"## {stratum}",
            "",
            "| SC | DOM P | DOM R | Detector P | Detector R | dR |",
            "|---|---|---|---|---|---|",
        ]
        for sc in SCS:
            a, b = _cell(dom, stratum, sc), _cell(detector, stratum, sc)
            if a is None and b is None:
                continue
            ra = None if a is None else a["recall"]
            rb = None if b is None else b["recall"]
            delta = None if ra is None or rb is None else rb - ra
            pa = None if a is None else a["precision"]
            pb = None if b is None else b["precision"]
            lines.append(
                f"| {sc} | {_fmt(pa)} | {_fmt(ra)} | {_fmt(pb)} | {_fmt(rb)} | {_fmt(delta)} |"
            )
        lines.append("")
    return "\n".join(lines) + "\n"


def write(dom_dir: Path, detector_dir: Path, out: Path) -> Path:
    dom = json.loads((dom_dir / "metrics.json").read_text())
    detector = json.loads((detector_dir / "metrics.json").read_text())
    out.mkdir(parents=True, exist_ok=True)
    path = out / "ablation.md"
    path.write_text(table(dom, detector))
    return path
