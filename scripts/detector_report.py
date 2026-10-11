from __future__ import annotations

import argparse
import contextlib
import csv
import hashlib
import io
import json
from pathlib import Path

import numpy as np
from auditor.detector import classmap
from auditor.detector.infer import Detector, postprocess
from PIL import Image
from pycocotools.coco import COCO
from pycocotools.cocoeval import COCOeval

SCORE_FLOOR = 0.001


def evaluate(onnx: Path, valid: Path) -> dict[str, object]:
    with contextlib.redirect_stdout(io.StringIO()):
        truth = COCO(str(valid / "_annotations.coco.json"))
    names = classmap.classes()
    category_ids = {c["name"]: c["id"] for c in truth.loadCats(truth.getCatIds())}
    assert set(names) == set(category_ids), (names, category_ids)
    detector = Detector(onnx)
    results: list[dict[str, object]] = []
    image_ids = sorted(truth.getImgIds())
    for n, image_id in enumerate(image_ids, 1):
        info = truth.loadImgs(image_id)[0]
        image = np.asarray(Image.open(valid / info["file_name"]).convert("RGB"))
        boxes, logits = detector._run(image)
        for d in postprocess(boxes, logits, image.shape[:2], names, SCORE_FLOOR):
            b = d.bbox
            results.append(
                {
                    "image_id": image_id,
                    "category_id": category_ids[d.cls],
                    "bbox": [b.x, b.y, b.w, b.h],
                    "score": d.score,
                }
            )
        if n % 250 == 0:
            print(f"{n}/{len(image_ids)} images", flush=True)
    with contextlib.redirect_stdout(io.StringIO()):
        detections = truth.loadRes(results) if results else COCO()
        overall = COCOeval(truth, detections, "bbox")
        overall.evaluate()
        overall.accumulate()
        overall.summarize()
    per_class: dict[str, float] = {}
    for name in names:
        with contextlib.redirect_stdout(io.StringIO()):
            ev = COCOeval(truth, detections, "bbox")
            ev.params.catIds = [category_ids[name]]
            ev.evaluate()
            ev.accumulate()
            ev.summarize()
        per_class[name] = float(ev.stats[0])
    return {
        "images": len(image_ids),
        "ground_truth_boxes": len(truth.getAnnIds()),
        "detections": len(results),
        "mAP_50_95": float(overall.stats[0]),
        "mAP_50": float(overall.stats[1]),
        "mAP_75": float(overall.stats[2]),
        "mAR_100": float(overall.stats[8]),
        "per_class_AP_50_95": per_class,
    }


def training_curve(metrics_csv: Path, out: Path) -> list[dict[str, float]]:
    rows = []
    for row in csv.DictReader(metrics_csv.open()):
        if row.get("val/ema_mAP_50_95"):
            rows.append(
                {
                    "epoch": int(float(row["epoch"])) + 1,
                    "ema_mAP_50_95": float(row["val/ema_mAP_50_95"]),
                    "ema_mAP_50": float(row["val/ema_mAP_50"]),
                }
            )
    with out.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["epoch", "ema_mAP_50_95", "ema_mAP_50"])
        writer.writeheader()
        writer.writerows(rows)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--onnx", type=Path, default=Path("data/models/detector.onnx"))
    ap.add_argument("--dataset", type=Path, default=Path("data/webui/prepared_full"))
    ap.add_argument("--run", type=Path, default=Path("data/models/rfdetr-nano-full"))
    ap.add_argument("--out", type=Path, default=Path("eval/detector"))
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    result = evaluate(args.onnx, args.dataset / "valid")
    result["onnx_sha256"] = hashlib.sha256(args.onnx.read_bytes()).hexdigest()
    manifest = args.dataset / "manifest.json"
    result["manifest_sha256"] = hashlib.sha256(manifest.read_bytes()).hexdigest()
    (args.out / "onnx_validation.json").write_text(json.dumps(result, indent=1))
    curve = training_curve(args.run / "metrics.csv", args.out / "training_curve.csv")
    per_class = result["per_class_AP_50_95"]
    assert isinstance(per_class, dict)
    lines = [
        "# Detector validation report",
        "",
        f"Model `{args.onnx}` (sha256 `{str(result['onnx_sha256'])[:16]}`), evaluated with "
        f"onnxruntime on CPU on the held-out WebUI validation split ({result['images']} images, "
        f"{result['ground_truth_boxes']} boxes; manifest `{str(result['manifest_sha256'])[:16]}`). "
        "Each image is squashed to 576 x 576, no tiling, one class per query (the shipped "
        f"postprocess) with a score floor of {SCORE_FLOOR}. COCO mAP, 101-point interpolation, "
        "IoU 0.50:0.95.",
        "",
        "| metric | value |",
        "|---|---|",
        f"| mAP 50:95 | {result['mAP_50_95']:.4f} |",
        f"| mAP 50 | {result['mAP_50']:.4f} |",
        f"| mAP 75 | {result['mAP_75']:.4f} |",
        f"| mAR (100 detections) | {result['mAR_100']:.4f} |",
        "",
        "| class | AP 50:95 |",
        "|---|---|",
        *[f"| {k} | {v:.4f} |" for k, v in per_class.items()],
        "",
        "Training-time validation of the same weights (EMA, PyTorch, `metrics.csv`), per epoch:",
        "",
        "| epoch | mAP 50:95 | mAP 50 |",
        "|---|---|---|",
        *[f"| {r['epoch']} | {r['ema_mAP_50_95']:.4f} | {r['ema_mAP_50']:.4f} |" for r in curve],
        "",
        "The ONNX figure differs slightly from the epoch-20 training figure because the training "
        "evaluator and the shipped postprocess are not identical (query-level top-k versus one "
        "class per query). This is the validation split, not the 110-page benchmark.",
    ]
    (args.out / "REPORT.md").write_text("\n".join(lines) + "\n")
    print((args.out / "REPORT.md").read_text())


if __name__ == "__main__":
    main()
