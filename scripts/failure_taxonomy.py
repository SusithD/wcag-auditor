from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from pathlib import Path

SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]


def load(eval_dir: Path) -> list[dict[str, str]]:
    with (eval_dir / "failures.csv").open() as fh:
        return list(csv.DictReader(fh))


def table(rows: list[dict[str, str]], condition: str) -> str:
    sel = [r for r in rows if r["condition"] == condition]
    by_sc: Counter[tuple[str, str, str]] = Counter((r["sc"], r["stratum"], r["type"]) for r in sel)
    lines = [
        f"### {condition}: failures per criterion and stratum",
        "",
        "| SC | real FP | real FN | synthetic FP | synthetic FN |",
        "|---|---|---|---|---|",
    ]
    for sc in SCS:
        cells = [by_sc[(sc, s, t)] for s in ("real", "synthetic") for t in ("FP", "FN")]
        lines.append(f"| {sc} | " + " | ".join(str(c) for c in cells) + " |")
    feat: Counter[tuple[str, str, str]] = Counter()
    for r in sel:
        if r["stratum"] != "real":
            continue
        pf = json.loads(r["page_features"] or "{}")
        feat[("non-responsive", str(pf.get("is_non_responsive")), r["type"])] += 1
        feat[("sector", str(pf.get("sector")), r["type"])] += 1
    lines += [
        "",
        f"### {condition}: real-stratum failures by page feature",
        "",
        "| feature | value | FP | FN |",
        "|---|---|---|---|",
    ]
    for name, value in sorted({(k[0], k[1]) for k in feat}):
        lines.append(
            f"| {name} | {value} | {feat[(name, value, 'FP')]} | {feat[(name, value, 'FN')]} |"
        )
    return "\n".join(lines) + "\n"


def main(eval_dir: Path) -> Path:
    rows = load(eval_dir)
    text = (
        "# Failure taxonomy\n\nFrom failures.csv (every false positive and false negative, "
        "with page features).\n\n"
    )
    text += "\n".join(table(rows, c) for c in ("rule_only", "pixel", "hybrid"))
    out = eval_dir / "failure_taxonomy.md"
    out.write_text(text)
    return out


if __name__ == "__main__":
    print(main(Path(sys.argv[1])))
