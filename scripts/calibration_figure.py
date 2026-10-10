from __future__ import annotations

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
matplotlib.rcParams["svg.hashsalt"] = "wcag-auditor"
import matplotlib.pyplot as plt  # noqa: E402

META = {".svg": {"Date": None}, ".pdf": {"CreationDate": None, "Producer": None}}
STRATA = ("real", "synthetic", "combined")
STYLE = {"pixel": ("#71717a", "o"), "hybrid": ("#18181b", "s")}


def reliability(out_dir: Path) -> list[Path]:
    summary = json.loads((out_dir / "calibration.json").read_text())
    fig, axes = plt.subplots(1, len(STRATA), figsize=(15, 4.6), sharex=True, sharey=True)
    for ax, stratum in zip(axes, STRATA, strict=True):
        ax.plot([0, 1], [0, 1], color="#a1a1aa", linestyle=":", label="perfect calibration")
        for condition, (colour, marker) in STYLE.items():
            cell = summary.get(condition, {}).get(stratum)
            if cell is None:
                continue
            bins = [b for b in cell["bins"] if b["n"] > 0]
            ax.scatter(
                [b["confidence"] for b in bins],
                [b["accuracy"] for b in bins],
                s=[20 + 6 * b["n"] ** 0.5 for b in bins],
                color=colour,
                marker=marker,
                alpha=0.85,
                label=f"{condition}: ECE {cell['ece']:.3f}, n {cell['n']}",
            )
            ax.plot(
                [b["confidence"] for b in bins],
                [b["accuracy"] for b in bins],
                color=colour,
                linewidth=1,
            )
        ax.set_title(f"{stratum} stratum")
        ax.set_xlabel("mean score in bin")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1.02)
        ax.grid(alpha=0.25)
        ax.legend(fontsize=8, frameon=False, loc="upper left")
    axes[0].set_ylabel("fraction of findings correct")
    fig.suptitle("Reliability of module scores (marker area grows with bin size)")
    fig.tight_layout()
    out = [out_dir / "reliability.svg", out_dir / "reliability.pdf"]
    for p in out:
        fig.savefig(p, metadata=META[p.suffix])
    plt.close(fig)
    return out


if __name__ == "__main__":
    for path in reliability(Path(sys.argv[1])):
        print(f"wrote {path}")
