from __future__ import annotations

import csv
import random
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
SEED = 20261010
CELLS = [("AB", "S1"), ("AB", "S2"), ("BA", "S1"), ("BA", "S2")]
CONDITION = {"A": "rule_only", "B": "hybrid"}
FIELDS = [
    "participant_code",
    "synthetic",
    "order",
    "block1_condition",
    "block2_condition",
    "block1_set",
    "block2_set",
    "task_order",
]


def build(codes: list[str], synthetic: bool, tasks_file: Path) -> list[dict[str, str]]:
    sets = yaml.safe_load(tasks_file.read_text())["sets"]
    rng = random.Random(SEED)
    rows = []
    for index, code in enumerate(codes):
        order, first_set = CELLS[index % len(CELLS)]
        second_set = "S2" if first_set == "S1" else "S1"
        first = rng.sample(sets[first_set], len(sets[first_set]))
        second = rng.sample(sets[second_set], len(sets[second_set]))
        rows.append(
            {
                "participant_code": code,
                "synthetic": "1" if synthetic else "0",
                "order": order,
                "block1_condition": CONDITION[order[0]],
                "block2_condition": CONDITION[order[1]],
                "block1_set": first_set,
                "block2_set": second_set,
                "task_order": " ".join(first + second),
            }
        )
    return rows


def main(out: Path, count: int = 16) -> Path:
    rows = build([f"SYN{i:02d}" for i in range(1, count + 1)], True, ROOT / "study" / "tasks.yaml")
    with out.open("w", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return out


if __name__ == "__main__":
    print(main(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "study" / "assignments.csv"))
