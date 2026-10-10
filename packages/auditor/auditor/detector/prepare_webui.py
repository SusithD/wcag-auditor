from __future__ import annotations

import argparse
import hashlib
import io
import json
from collections import Counter
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from auditor.detector import classmap

DEVICE_SCALE = {"default": 1, "iPad-Mini": 2, "iPad-Pro": 2, "iPhone-13 Pro": 3, "iPhone-SE": 3}
MAX_BOXES = 300
PHASH_SIZE = 16
SPLIT_BUCKETS = 1000


def device_scale(key_name: str) -> int:
    return DEVICE_SCALE.get(key_name.split("_")[0], 1)


def group_id(labels: list[list[str]]) -> str:
    """Rows that are the same page at different viewports share one label sequence."""
    return hashlib.sha1(json.dumps(labels, separators=(",", ":")).encode()).hexdigest()[:16]


def split_of(group: str, val_fraction: float) -> str:
    bucket = int(group, 16) % SPLIT_BUCKETS
    return "valid" if bucket < val_fraction * SPLIT_BUCKETS else "train"


def phash(image: Image.Image) -> int:
    """256-bit difference hash of the grayscale thumbnail (rows of 17 pixels, left < right)."""
    small = np.asarray(image.convert("L").resize((PHASH_SIZE + 1, PHASH_SIZE)), dtype=np.int16)
    bits = (small[:, 1:] > small[:, :-1]).flatten()
    return int(sum(1 << i for i, b in enumerate(bits) if b))


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


class HashIndex:
    """Kept hashes as uint64 words, so a candidate is compared with all of them at once."""

    def __init__(self) -> None:
        self.words = np.zeros((0, PHASH_SIZE * PHASH_SIZE // 64), dtype=np.uint64)

    def add(self, value: int) -> None:
        row = np.array(
            [(value >> (64 * k)) & (2**64 - 1) for k in range(self.words.shape[1])],
            dtype=np.uint64,
        )[None]
        self.words = np.concatenate([self.words, row]) if self.words.size else row

    def min_distance(self, value: int) -> int:
        if not self.words.size:
            return PHASH_SIZE * PHASH_SIZE
        row = np.array(
            [(value >> (64 * k)) & (2**64 - 1) for k in range(self.words.shape[1])],
            dtype=np.uint64,
        )
        return int(np.bitwise_count(self.words ^ row).sum(axis=1).min())


def convert_boxes(
    boxes: list[list[float]],
    labels: list[list[str]],
    key_name: str,
    size: tuple[int, int],
    min_area: float,
) -> list[tuple[str, list[float]]]:
    """(class, [x, y, w, h]) in image px: content boxes are CSS px, scaled by the device ratio."""
    scale = device_scale(key_name)
    width, height = size
    out: list[tuple[str, list[float]]] = []
    for (x0, y0, x1, y1), label in zip(boxes, labels, strict=False):
        cls = classmap.class_for(label)
        if cls is None:
            continue
        x0, y0, x1, y1 = (
            min(max(0.0, x0 * scale), width),
            min(max(0.0, y0 * scale), height),
            min(max(0.0, x1 * scale), width),
            min(max(0.0, y1 * scale), height),
        )
        if x1 <= x0 or y1 <= y0 or (x1 - x0) * (y1 - y0) < min_area:
            continue
        out.append((cls, [x0, y0, x1 - x0, y1 - y0]))
    return out[:MAX_BOXES]


def benchmark_hashes(benchmark: Path | None) -> list[tuple[str, int]]:
    """Hashes of the first screen of every real benchmark capture (the evaluation pages)."""
    if benchmark is None or not benchmark.is_dir():
        return []
    out: list[tuple[str, int]] = []
    for meta in sorted(benchmark.glob("**/real_*/meta.json")):
        spec = json.loads(meta.read_text())["viewport_spec"]
        with Image.open(meta.parent / "screenshot.png") as shot:
            top = shot.convert("RGB").crop((0, 0, shot.width, min(shot.height, spec["height"])))
            out.append((meta.parent.name, phash(top)))
    return out


def leak_distance(image_hash: int, bench: list[tuple[str, int]]) -> int:
    return min((hamming(image_hash, h) for _, h in bench), default=PHASH_SIZE * PHASH_SIZE)


def verify_no_leak(manifest: dict[str, Any], bench: list[tuple[str, int]], bits: int) -> None:
    leaks = [
        item["file"]
        for item in manifest["items"]
        if leak_distance(int(item["phash"], 16), bench) <= bits
    ]
    if leaks:
        raise AssertionError(f"{len(leaks)} training images resemble benchmark pages: {leaks[:5]}")


def iter_rows(shards: list[Path]) -> Iterator[tuple[Path, int, dict[str, Any]]]:
    import pyarrow.parquet as pq

    for shard in shards:
        pf = pq.ParquetFile(shard)
        for g in range(pf.metadata.num_row_groups):
            for i, row in enumerate(pf.read_row_group(g).to_pylist()):
                yield shard, g * 10_000 + i, row


def prepare(
    shards: list[Path],
    out: Path,
    train: int,
    val: int,
    seed: int,
    benchmark: Path | None,
    min_area: float = 100.0,
    dedupe_bits: int = 8,
    leak_bits: int = 16,
    allow_unscreened: bool = False,
) -> dict[str, Any]:
    bench = benchmark_hashes(benchmark)
    if not bench and not allow_unscreened:
        raise ValueError("no benchmark pages to screen against; pass allow_unscreened to override")
    val_fraction = val / max(1, train + val)
    quota = {"train": train, "valid": val}
    kept: dict[str, list[dict[str, Any]]] = {"train": [], "valid": []}
    index = HashIndex()
    counter = 0
    stats: Counter[str] = Counter()
    class_counts: Counter[str] = Counter()
    for _shard, _row_id, row in iter_rows(shards):
        stats["rows_seen"] += 1
        if len(row["contentBoxes"]) != len(row["labels"]):
            stats["malformed"] += 1
            continue
        split = split_of(group_id(row["labels"]), val_fraction)
        if len(kept[split]) >= quota[split]:
            continue
        image = Image.open(io.BytesIO(row["image"]["bytes"])).convert("RGB")
        boxes = convert_boxes(
            row["contentBoxes"], row["labels"], row["key_name"], image.size, min_area
        )
        if not boxes:
            stats["no_boxes"] += 1
            continue
        h = phash(image)
        if index.min_distance(h) <= dedupe_bits:
            stats["near_duplicate"] += 1
            continue
        if leak_distance(h, bench) <= leak_bits:
            stats["benchmark_like"] += 1
            continue
        index.add(h)
        counter += 1
        name = f"{split}/{counter:06d}.png"
        path = out / name
        path.parent.mkdir(parents=True, exist_ok=True)
        image.save(path, compress_level=1)
        kept[split].append(
            {
                "file": name,
                "width": image.width,
                "height": image.height,
                "key_name": row["key_name"],
                "group": group_id(row["labels"]),
                "phash": f"{h:0{PHASH_SIZE * PHASH_SIZE // 4}x}",
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                "boxes": [{"class": c, "bbox": [round(v, 2) for v in b]} for c, b in boxes],
            }
        )
        class_counts.update(c for c, _ in boxes)
        if all(len(kept[s]) >= quota[s] for s in quota):
            break
    return _write(out, kept, shards, stats, class_counts, benchmark, bench, leak_bits, seed)


def _write(
    out: Path,
    kept: dict[str, list[dict[str, Any]]],
    shards: list[Path],
    stats: Counter[str],
    class_counts: Counter[str],
    benchmark: Path | None,
    bench: list[tuple[str, int]],
    leak_bits: int,
    seed: int,
) -> dict[str, Any]:
    names = classmap.classes()
    for split, items in kept.items():
        (out / split).mkdir(parents=True, exist_ok=True)
        coco: dict[str, Any] = {
            "images": [],
            "annotations": [],
            "categories": [{"id": i, "name": n} for i, n in enumerate(names)],
        }
        ann = 1
        for image_id, item in enumerate(items, 1):
            coco["images"].append(
                {
                    "id": image_id,
                    "file_name": Path(item["file"]).name,
                    "width": item["width"],
                    "height": item["height"],
                }
            )
            for box in item["boxes"]:
                x, y, w, h = box["bbox"]
                coco["annotations"].append(
                    {
                        "id": ann,
                        "image_id": image_id,
                        "category_id": names.index(box["class"]),
                        "bbox": [x, y, w, h],
                        "area": w * h,
                        "iscrowd": 0,
                    }
                )
                ann += 1
        (out / split / "_annotations.coco.json").write_text(json.dumps(coco))
    manifest = {
        "seed": seed,
        "classes": names,
        "shards": {s.name: hashlib.sha256(s.read_bytes()).hexdigest() for s in shards},
        "counts": {split: len(items) for split, items in kept.items()},
        "boxes_per_class": dict(class_counts),
        "filtered": dict(stats),
        "benchmark_check": {
            "benchmark": str(benchmark) if benchmark else None,
            "pages_hashed": len(bench),
            "leak_bits": leak_bits,
            "min_distance": min(
                (leak_distance(int(i["phash"], 16), bench) for v in kept.values() for i in v),
                default=None,
            ),
            "note": "the dataset carries no URLs, so the eTLD+1 hold-out is replaced by "
            "perceptual-hash screening against the benchmark pages and a label-sequence "
            "page-group split",
        },
        "classmap_sha256": hashlib.sha256(classmap.CLASSMAP_PATH.read_bytes()).hexdigest(),
        "items": kept["train"] + kept["valid"],
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--shards", type=Path, default=Path("data/webui"))
    ap.add_argument("--out", type=Path, default=Path("data/webui/prepared"))
    ap.add_argument("--train", type=int, default=15000)
    ap.add_argument("--val", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=20261004)
    ap.add_argument("--benchmark", type=Path, default=None)
    ap.add_argument("--smoke", action="store_true", help="200 train / 40 val images")
    ap.add_argument("--no-benchmark-check", action="store_true")
    args = ap.parse_args()
    train, val = (200, 40) if args.smoke else (args.train, args.val)
    shards = sorted(args.shards.glob("train-*.parquet"))
    manifest = prepare(
        shards,
        args.out,
        train,
        val,
        args.seed,
        args.benchmark,
        allow_unscreened=args.no_benchmark_check,
    )
    print(json.dumps({k: manifest[k] for k in ("counts", "boxes_per_class", "filtered")}, indent=1))


if __name__ == "__main__":
    main()
