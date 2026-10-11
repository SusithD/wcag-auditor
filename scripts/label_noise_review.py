from __future__ import annotations

import argparse
import csv
import json
import math
import random
from pathlib import Path

CHECKED = Path("eval/detector/label_noise/label_noise_checked.csv")
CROPS = Path("data/label_noise")
AUDIT_SIZE = 30
SEED = 20261004


def load_checked(path: Path = CHECKED) -> list[dict[str, str]]:
    return list(csv.DictReader(path.open()))


def split(
    rows: list[dict[str, str]], audit: int = AUDIT_SIZE, seed: int = SEED
) -> dict[str, list[int]]:
    """Stratum D: the AI lenses disagree (every one is reviewed). Stratum E: all three agree
    (a random `audit` of them is reviewed to measure how far the agreed verdict can be trusted)."""
    disagree, agree = [], []
    for r in rows:
        verdicts = {int(r["geometry"]), int(r["class_ok"]), int(r["strict"])}
        (agree if len(verdicts) == 1 else disagree).append(int(r["id"]))
    chosen = sorted(random.Random(seed).sample(agree, min(audit, len(agree))))
    return {"disagree": disagree, "agree": agree, "agree_audit": chosen}


def review_ids(rows: list[dict[str, str]]) -> list[int]:
    parts = split(rows)
    ids = parts["disagree"] + parts["agree_audit"]
    random.Random(SEED + 1).shuffle(ids)
    return ids


TEMPLATE = Path(__file__).with_name("label_noise_review.html")


def pack(out: Path = CROPS) -> Path:
    rows = load_checked()
    ids = review_ids(rows)
    from PIL import Image

    items = []
    for i in ids:
        crop = f"crop_{i:03d}.png"
        with Image.open(out / crop) as im:
            width = im.width
        items.append({"id": i, "cls": rows[i]["class"], "crop": crop, "w": width})
    (out / "review.html").write_text(TEMPLATE.read_text().replace("__ITEMS__", json.dumps(items)))
    (out / "review_ids.json").write_text(json.dumps(split(rows)))
    return out / "review.html"


def wilson_free_ci(p: float, n: int) -> float:
    return 1.96 * math.sqrt(max(p * (1 - p), 0.0) / n) if n else 0.0


def merge(human_csv: Path) -> dict[str, object]:
    rows = load_checked()
    parts = split(rows)
    human = {
        int(r["id"]): int(r["human"])
        for r in csv.DictReader(human_csv.open())
        if r["human"] in ("0", "1")
    }
    ai_combined = {int(r["id"]): int(r["correct_geometry_and_class"]) for r in rows}
    ai_strict = {int(r["id"]): int(r["strict"]) for r in rows}
    d_ids = [i for i in parts["disagree"] if i in human]
    e_ids = [i for i in parts["agree_audit"] if i in human]
    n = len(rows)
    wrong_d = sum(1 - human[i] for i in d_ids)
    d_missing = len(parts["disagree"]) - len(d_ids)
    e_rate = sum(1 - human[i] for i in e_ids) / len(e_ids) if e_ids else float("nan")
    est_wrong = wrong_d + len(parts["agree"]) * (e_rate if e_ids else 0.0)
    noise = est_wrong / n
    se_e = (
        len(parts["agree"]) * math.sqrt(max(e_rate * (1 - e_rate), 0.0) / len(e_ids))
        if e_ids
        else 0.0
    )
    agree_with_combined = sum(human[i] == ai_combined[i] for i in human) / max(1, len(human))
    agree_with_strict = sum(human[i] == ai_strict[i] for i in human) / max(1, len(human))
    return {
        "human_answers": len(human),
        "disagreement_items": len(parts["disagree"]),
        "disagreement_items_reviewed": len(d_ids),
        "disagreement_items_missing": d_missing,
        "agreed_items": len(parts["agree"]),
        "agreed_items_audited": len(e_ids),
        "human_wrong_in_disagreements": wrong_d,
        "human_wrong_rate_in_agreed_audit": e_rate,
        "estimated_noise_rate": noise,
        "ci95_half_width": 1.96 * se_e / n,
        "raw_agreement_human_vs_ai_geometry_and_class": agree_with_combined,
        "raw_agreement_human_vs_ai_strict": agree_with_strict,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("pack")
    m = sub.add_parser("merge")
    m.add_argument("human_csv", type=Path)
    args = ap.parse_args()
    if args.cmd == "pack":
        print(pack())
    else:
        print(json.dumps(merge(args.human_csv), indent=1))


if __name__ == "__main__":
    main()
