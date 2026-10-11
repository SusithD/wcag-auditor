from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

SAMPLE = 200
CROP_PAD = 24


def sample_boxes(manifest: dict[str, object], n: int, seed: int) -> list[dict[str, object]]:
    items = manifest["items"]
    assert isinstance(items, list)
    pool = [
        {"file": item["file"], "class": b["class"], "bbox": b["bbox"]}
        for item in items
        if item["file"].startswith("valid/")
        for b in item["boxes"]
    ]
    random.Random(seed).shuffle(pool)
    return pool[:n]


def build(dataset: Path, out: Path, n: int = SAMPLE, seed: int = 20261004) -> Path:
    """Write crops and a CSV for the hand check of label noise: open the crops, put 1 (box and
    class correct) or 0 in the `correct` column, then run `summarise`."""
    manifest = json.loads((dataset / "manifest.json").read_text())
    rows = sample_boxes(manifest, n, seed)
    out.mkdir(parents=True, exist_ok=True)
    with (out / "label_noise.csv").open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["id", "file", "class", "bbox", "crop", "correct"])
        for i, row in enumerate(rows):
            x, y, w, h = (float(v) for v in row["bbox"])  # type: ignore[attr-defined]
            with Image.open(dataset / str(row["file"])) as image:
                crop = image.convert("RGB").crop(
                    (max(0, x - CROP_PAD), max(0, y - CROP_PAD), x + w + CROP_PAD, y + h + CROP_PAD)
                )
                draw = ImageDraw.Draw(crop)
                draw.rectangle(
                    (
                        min(CROP_PAD, x),
                        min(CROP_PAD, y),
                        min(CROP_PAD, x) + w,
                        min(CROP_PAD, y) + h,
                    ),
                    outline=(255, 0, 255),
                )
            name = f"crop_{i:03d}.png"
            crop.save(out / name)
            writer.writerow([i, row["file"], row["class"], json.dumps(row["bbox"]), name, ""])
    return out / "label_noise.csv"


def summarise(csv_path: Path) -> dict[str, float | int | None]:
    with csv_path.open() as fh:
        rows = [r for r in csv.DictReader(fh) if r["correct"].strip() in {"0", "1"}]
    correct = sum(int(r["correct"]) for r in rows)
    noise = 1 - correct / len(rows) if rows else None
    return {"checked": len(rows), "correct": correct, "noise_rate": noise}


def main() -> None:
    ap = argparse.ArgumentParser(description=build.__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--dataset", type=Path, default=Path("data/webui/prepared"))
    b.add_argument("--out", type=Path, default=Path("eval/detector/label_noise"))
    s = sub.add_parser("summarise")
    s.add_argument("csv", type=Path)
    args = ap.parse_args()
    if args.cmd == "build":
        print(build(args.dataset, args.out))
    else:
        summary = summarise(args.csv)
        if not summary["checked"]:
            print("no rows checked")
        else:
            print(json.dumps(summary, indent=1))


if __name__ == "__main__":
    main()
