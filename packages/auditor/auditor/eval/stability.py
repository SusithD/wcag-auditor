from __future__ import annotations

import csv
import json
import random
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from auditor import protocol
from auditor.geometry import containment, iou
from auditor.schema import Capture, Finding

FOCUS_SCS = {"2.4.7", "2.4.11", "2.4.12", "2.4.13"}


@dataclass
class Agreement:
    sc: str
    benchmark: int
    recapture: int
    matched: int

    @property
    def dice(self) -> float | None:
        total = self.benchmark + self.recapture
        return None if total == 0 else 2 * self.matched / total


def _same_place(a: Finding, b: Finding, iou_min: float, containment_min: float) -> bool:
    if a.sc in FOCUS_SCS:
        return a.focus_index == b.focus_index
    if a.bbox is None or b.bbox is None:
        return False
    return (
        iou(a.bbox, b.bbox) >= iou_min
        or containment(a.bbox, b.bbox) >= containment_min
        or containment(b.bbox, a.bbox) >= containment_min
    )


def compare_findings(
    benchmark: list[Finding], recapture: list[Finding], iou_min: float, containment_min: float
) -> list[Agreement]:
    """One-to-one matching of findings per criterion; Dice = 2 matched / (n_a + n_b)."""
    out: list[Agreement] = []
    for sc in sorted({f.sc for f in benchmark} | {f.sc for f in recapture}):
        a = [f for f in benchmark if f.sc == sc]
        b = [f for f in recapture if f.sc == sc]
        used: set[int] = set()
        matched = 0
        for fa in a:
            for j, fb in enumerate(b):
                if j not in used and _same_place(fa, fb, iou_min, containment_min):
                    used.add(j)
                    matched += 1
                    break
        out.append(Agreement(sc, len(a), len(b), matched))
    return out


def sample_pages(benchmark: Path, n: int, seed: int) -> list[Path]:
    pages = sorted(benchmark.glob("real_*_desktop_*"))
    rng = random.Random(seed)
    return sorted(rng.sample(pages, min(n, len(pages))))


def _findings(report: Path) -> list[Finding]:
    data: dict[str, Any] = json.loads(report.read_text())
    return [Finding.model_validate(f) for f in data["findings"]]


def run_stability(
    benchmark: Path, out: Path, n: int = 10, seed: int = 20261004, max_focus_steps: int = 15
) -> dict[str, Any]:
    from auditor.capture import PlaywrightBrowser, capture_url
    from auditor.pipeline import run_folder

    match = protocol.load().thresholds.match
    out.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []
    work = Path(tempfile.mkdtemp(prefix="stability_"))
    try:
        with PlaywrightBrowser() as browser:
            for folder in sample_pages(benchmark, n, seed):
                capture = Capture.from_folder(folder)
                url = str(capture.meta.get("final_url") or capture.meta.get("url") or "")
                page_id = folder.name
                try:
                    errors: list[str] = []
                    made = capture_url(
                        browser, url, work / "captures", ["desktop"], max_focus_steps, errors=errors
                    )
                    if not made:
                        raise RuntimeError(errors[0] if errors else "capture failed")
                    run_folder(folder, work / page_id / "benchmark", "hybrid", pdf=False)
                    run_folder(made[0], work / page_id / "recapture", "hybrid", pdf=False)
                    base = _findings(work / page_id / "benchmark" / "report.json")
                    again = _findings(work / page_id / "recapture" / "report.json")
                    new_meta = Capture.from_folder(made[0]).meta
                except Exception as exc:
                    failures.append(
                        {
                            "page_id": page_id,
                            "url": url,
                            "error": f"{type(exc).__name__}: {exc}"[:300],
                        }
                    )
                    continue
                for ag in compare_findings(base, again, match.iou, match.containment):
                    rows.append(
                        {
                            "page_id": page_id,
                            "url": url,
                            "sc": ag.sc,
                            "benchmark": ag.benchmark,
                            "recapture": ag.recapture,
                            "matched": ag.matched,
                            "dice": "" if ag.dice is None else f"{ag.dice:.3f}",
                            "focus_steps_benchmark": capture.meta.get("focus_step_count"),
                            "focus_steps_recapture": new_meta.get("focus_step_count"),
                        }
                    )
    finally:
        shutil.rmtree(work, ignore_errors=True)
    fields = list(rows[0]) if rows else ["page_id"]
    with (out / "stability.csv").open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    summary = summarise(rows, failures, n, seed)
    (out / "stability.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    (out / "stability.md").write_text(markdown(summary))
    return summary


def summarise(
    rows: list[dict[str, Any]], failures: list[dict[str, str]], n: int, seed: int
) -> dict[str, Any]:
    per_sc: dict[str, dict[str, int]] = {}
    for r in rows:
        c = per_sc.setdefault(r["sc"], {"benchmark": 0, "recapture": 0, "matched": 0})
        c["benchmark"] += int(r["benchmark"])
        c["recapture"] += int(r["recapture"])
        c["matched"] += int(r["matched"])
    table = {
        sc: {
            **c,
            "dice": None
            if c["benchmark"] + c["recapture"] == 0
            else round(2 * c["matched"] / (c["benchmark"] + c["recapture"]), 3),
        }
        for sc, c in sorted(per_sc.items())
    }
    total = {k: sum(c[k] for c in per_sc.values()) for k in ("benchmark", "recapture", "matched")}
    overall = (
        None
        if total["benchmark"] + total["recapture"] == 0
        else round(2 * total["matched"] / (total["benchmark"] + total["recapture"]), 3)
    )
    return {
        "sample_size": n,
        "seed": seed,
        "pages_compared": len({r["page_id"] for r in rows}),
        "pages_failed": failures,
        "per_sc": table,
        "overall_dice": overall,
    }


def markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Re-capture stability",
        "",
        f"Sample of {summary['sample_size']} real desktop pages (seed {summary['seed']}); "
        f"{summary['pages_compared']} re-captured and compared, "
        f"{len(summary['pages_failed'])} failed.",
        "Agreement is the Dice coefficient of one-to-one matched findings (page criteria by "
        "IoU or containment, focus criteria by stop index).",
        "",
        "| SC | benchmark | re-capture | matched | Dice |",
        "|---|---|---|---|---|",
    ]
    for sc, c in summary["per_sc"].items():
        d = "n/a" if c["dice"] is None else f"{c['dice']:.3f}"
        lines.append(f"| {sc} | {c['benchmark']} | {c['recapture']} | {c['matched']} | {d} |")
    lines.append("")
    lines.append(f"Overall Dice: {summary['overall_dice']}")
    for f in summary["pages_failed"]:
        lines.append(f"- failed {f['page_id']}: {f['error']}")
    return "\n".join(lines) + "\n"
