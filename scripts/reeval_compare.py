from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]
CONDITIONS = ("rule_only", "pixel", "hybrid")
STRATA = ("real", "synthetic", "combined")


def _f(v: float | None) -> str:
    return "n/a" if v is None else f"{v:.3f}"


def _delta(a: float | None, b: float | None) -> str:
    return "" if a is None or b is None else f" ({b - a:+.3f})"


def compare(old: dict[str, Any], new: dict[str, Any], old_label: str, new_label: str) -> str:
    lines = [
        "# Headline numbers: previous policy against ADR-028",
        "",
        f"A = {old_label}; B = {new_label}. Each cell is `P / R / F1` for A, then for B with "
        "the change in brackets.",
        "",
    ]
    for stratum in STRATA:
        for condition in CONDITIONS:
            if condition not in old["metrics"] or condition not in new["metrics"]:
                continue
            lines += [
                f"## {condition}, {stratum}",
                "",
                "| SC | A (P / R / F1) | B (P / R / F1) |",
                "|---|---|---|",
            ]
            for sc in SCS:
                a = old["metrics"][condition][stratum].get(sc)
                b = new["metrics"][condition][stratum].get(sc)
                if a is None or b is None:
                    continue
                left = " / ".join(_f(a[k]) for k in ("precision", "recall", "f1"))
                right = " / ".join(
                    _f(b[k]) + _delta(a[k], b[k]) for k in ("precision", "recall", "f1")
                )
                lines.append(f"| {sc} | {left} | {right} |")
            lines.append("")
    return "\n".join(lines) + "\n"


def main(old_path: Path, new_path: Path, out: Path, old_label: str, new_label: str) -> Path:
    old = json.loads(old_path.read_text())
    new = json.loads(new_path.read_text())
    out.write_text(compare(old, new, old_label, new_label))
    return out


if __name__ == "__main__":
    print(main(*(Path(a) for a in sys.argv[1:4]), *sys.argv[4:6]))
