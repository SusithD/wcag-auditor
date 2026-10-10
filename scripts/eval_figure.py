from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["svg.hashsalt"] = "wcag-auditor"
import matplotlib.pyplot as plt  # noqa: E402

META = {".svg": {"Date": None}, ".pdf": {"CreationDate": None, "Producer": None}}
FOCUS_SCS = {"2.4.7", "2.4.11", "2.4.12", "2.4.13"}
SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]
STYLE = {
    ("hybrid", "iou-only"): ("#18181b", "-", "o"),
    ("hybrid", "iou-or-containment"): ("#18181b", "--", "s"),
    ("rule_only", "iou-only"): ("#71717a", "-", "^"),
    ("rule_only", "iou-or-containment"): ("#71717a", "--", "v"),
}


def sensitivity(eval_dir: Path) -> list[Path]:
    series: dict[tuple[str, str, str, str], list[tuple[float, float]]] = defaultdict(list)
    with (eval_dir / "sensitivity.csv").open() as fh:
        for row in csv.DictReader(fh):
            if row["condition"] not in {"hybrid", "rule_only"}:
                continue
            for metric in ("precision", "recall"):
                if row[metric] != "":
                    key = (row["sc"], metric, row["condition"], row["rule"])
                    series[key].append((float(row["iou"]), float(row[metric])))
    fig, axes = plt.subplots(2, len(SCS), figsize=(18, 5.2), sharex=True, sharey=True)
    for col, sc in enumerate(SCS):
        for row_i, metric in enumerate(("precision", "recall")):
            ax = axes[row_i][col]
            for (cond, rule), (colour, line, marker) in STYLE.items():
                pts = sorted(series.get((sc, metric, cond, rule), []))
                if pts:
                    ax.plot(
                        [p[0] for p in pts],
                        [p[1] for p in pts],
                        color=colour,
                        linestyle=line,
                        marker=marker,
                        markersize=3,
                        linewidth=1.2,
                        label=f"{cond}, {rule}",
                    )
            ax.set_ylim(0, 1.02)
            ax.grid(alpha=0.25)
            if sc in FOCUS_SCS:
                ax.text(
                    0.5,
                    0.5,
                    "keyed by focus stop,\nnot IoU-based",
                    ha="center",
                    va="center",
                    transform=ax.transAxes,
                    fontsize=8,
                )
            if row_i == 0:
                ax.set_title(sc, fontsize=10)
            if col == 0:
                ax.set_ylabel(metric)
            if row_i == 1:
                ax.set_xlabel("IoU threshold")
    handles, labels = axes[0][0].get_legend_handles_labels()
    if not handles:
        for ax in axes.flat:
            handles, labels = ax.get_legend_handles_labels()
            if handles:
                break
    fig.legend(handles, labels, loc="lower center", ncol=4, frameon=False, fontsize=9)
    fig.suptitle("IoU sensitivity, combined strata: IoU only against IoU or containment (ADR-013)")
    fig.tight_layout(rect=(0, 0.06, 1, 0.96))
    out = [eval_dir / "sensitivity.svg", eval_dir / "sensitivity.pdf"]
    for p in out:
        fig.savefig(p, metadata=META[p.suffix])
    plt.close(fig)
    return out


def per_sc(eval_dir: Path) -> list[Path]:
    metrics = json.loads((eval_dir / "metrics.json").read_text())
    ci = metrics["bootstrap"]["ci"]
    fig, axes = plt.subplots(1, 3, figsize=(18, 4.2), sharey=True)
    width = 0.38
    for ax, stratum in zip(axes, ("real", "synthetic", "combined"), strict=True):
        for k, (cond, colour, hatch) in enumerate(
            (("rule_only", "#a1a1aa", "//"), ("hybrid", "#18181b", ""))
        ):
            values, lows, highs = [], [], []
            for sc in SCS:
                v = metrics["metrics"][cond][stratum][sc]["f1"]
                interval = ci[cond][stratum][sc]["f1"]
                values.append(0.0 if v is None else v)
                lows.append(0.0 if v is None or interval["low"] is None else v - interval["low"])
                highs.append(0.0 if v is None or interval["high"] is None else interval["high"] - v)
            xs = [i + (k - 0.5) * width for i in range(len(SCS))]
            ax.bar(
                xs,
                values,
                width,
                yerr=[lows, highs],
                color=colour,
                hatch=hatch,
                edgecolor="#18181b",
                capsize=2,
                label=cond,
            )
        ax.set_xticks(range(len(SCS)), SCS, rotation=45)
        ax.set_title(f"F1, {stratum} stratum")
        ax.set_ylim(0, 1.02)
        ax.grid(axis="y", alpha=0.25)
    axes[0].legend(frameon=False)
    fig.tight_layout()
    out = [eval_dir / "f1_by_sc.svg", eval_dir / "f1_by_sc.pdf"]
    for p in out:
        fig.savefig(p, metadata=META[p.suffix])
    plt.close(fig)
    return out


if __name__ == "__main__":
    target = Path(sys.argv[1])
    for path in [*sensitivity(target), *per_sc(target)]:
        print(f"wrote {path}")
