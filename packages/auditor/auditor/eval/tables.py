from __future__ import annotations

from typing import Any

from auditor.eval.units import SCS


def _fmt(v: float | None) -> str:
    return "n/a" if v is None else f"{v:.3f}"


def _ci(metrics: dict[str, Any], cond: str, stratum: str, sc: str, key: str) -> str:
    cell = metrics.get("bootstrap", {}).get("ci", {}).get(cond, {}).get(stratum, {}).get(sc)
    if not cell or cell[key]["low"] is None:
        return ""
    return f" [{cell[key]['low']:.2f}, {cell[key]['high']:.2f}]"


def _rows(metrics: dict[str, Any], cond: str, stratum: str) -> list[list[str]]:
    cells = metrics["metrics"].get(cond, {}).get(stratum, {})
    rows = []
    for sc in SCS:
        if sc not in cells:
            continue
        c = cells[sc]
        rows.append(
            [
                sc,
                str(c["tp"]),
                str(c["fp"]),
                str(c["fn"]),
                str(c["duplicates"]),
                _fmt(c["precision"]) + _ci(metrics, cond, stratum, sc, "precision"),
                _fmt(c["recall"]) + _ci(metrics, cond, stratum, sc, "recall"),
                _fmt(c["f1"]) + _ci(metrics, cond, stratum, sc, "f1"),
            ]
        )
    return rows


HEADER = ["SC", "TP", "FP", "FN", "Dup", "Precision", "Recall", "F1"]
PAIRED_HEADER = [
    "SC",
    "only A correct",
    "only B correct",
    "both correct",
    "both wrong",
    "McNemar p",
    "p (BH)",
    "dPrecision 95% CI",
    "non-inferior",
]


def _p(v: float | None) -> str:
    if v is None:
        return "n/a"
    return "<0.001" if v < 0.001 else f"{v:.3f}"


def paired_title(metrics: dict[str, Any], stratum: str) -> str:
    mc = metrics.get("mcnemar", {})
    return f"McNemar, A = {mc.get('a')} against B = {mc.get('b')}, {stratum}"


def _paired_rows(metrics: dict[str, Any], stratum: str) -> list[list[str]]:
    mc = metrics.get("mcnemar", {})
    tests = mc.get("tests", {}).get(stratum, {})
    deltas = metrics.get("bootstrap", {}).get("delta_precision", {}).get(stratum, {})
    rows = []
    for sc in SCS:
        if sc not in tests:
            continue
        t = tests[sc]
        d = deltas.get(sc, {})
        if t.get("p_value") is None:
            p_cell, adj = "degenerate: no discordant pairs", "n/a"
        else:
            p_cell = _p(t["p_value"])
            adj = _p(mc.get("bh_adjusted", {}).get(stratum, {}).get(sc))
        if d.get("low") is None:
            ci, ok = "not estimable", "n/a"
        else:
            ci = f"[{d['low']:.3f}, {d['high']:.3f}]"
            ok = "yes" if d.get("non_inferior") else "no"
        rows.append(
            [
                sc,
                str(t["only_a_correct"]),
                str(t["only_b_correct"]),
                str(t["both_correct"]),
                str(t["both_wrong"]),
                p_cell,
                adj,
                ci,
                ok,
            ]
        )
    return rows


def markdown(metrics: dict[str, Any]) -> str:
    lines = ["# Evaluation tables", ""]
    for cond, strata in metrics["metrics"].items():
        for stratum in strata:
            lines += [f"## {cond}, {stratum}", "", "| " + " | ".join(HEADER) + " |"]
            lines.append("|" + "---|" * len(HEADER))
            for row in _rows(metrics, cond, stratum):
                lines.append("| " + " | ".join(row) + " |")
            lines.append("")
    for stratum in metrics.get("mcnemar", {}).get("tests", {}):
        lines += [f"## {paired_title(metrics, stratum)}", ""]
        lines.append("| " + " | ".join(PAIRED_HEADER) + " |")
        lines.append("|" + "---|" * len(PAIRED_HEADER))
        for row in _paired_rows(metrics, stratum):
            lines.append("| " + " | ".join(row) + " |")
        lines.append("")
    for cond, cov in metrics.get("coverage", {}).items():
        lines.append(
            f"Coverage ({cond}): {cov['scs_with_verdict']} / {len(SCS)} SCs return a verdict."
        )
    return "\n".join(lines) + "\n"


def latex(metrics: dict[str, Any]) -> str:
    out: list[str] = []
    for cond, strata in metrics["metrics"].items():
        for stratum in strata:
            out.append(f"% {cond}, {stratum}")
            out.append("\\begin{tabular}{lrrrrrrr}")
            out.append("\\hline")
            out.append(" & ".join(HEADER) + " \\\\")
            out.append("\\hline")
            for row in _rows(metrics, cond, stratum):
                out.append(" & ".join(c.replace("%", "\\%") for c in row) + " \\\\")
            out.append("\\hline")
            out.append("\\end{tabular}")
            out.append("")
    for stratum in metrics.get("mcnemar", {}).get("tests", {}):
        out.append(f"% {paired_title(metrics, stratum)}")
        out.append("\\begin{tabular}{lrrrrlllc}")
        out.append("\\hline")
        out.append(" & ".join(PAIRED_HEADER) + " \\\\")
        out.append("\\hline")
        for row in _paired_rows(metrics, stratum):
            out.append(" & ".join(c.replace("%", "\\%").replace("<", "$<$") for c in row) + " \\\\")
        out.append("\\hline")
        out.append("\\end{tabular}")
        out.append("")
    return "\n".join(out) + "\n"
