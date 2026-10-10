from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from auditor.detector.train import MODELS

OPSET = 17


def export(checkpoint: Path, out: Path, model: str = "nano", resolution: int = 576) -> Path:
    """Export a trained RF-DETR checkpoint to ONNX (opset 17, batch 1, square input, fp32).

    The input size must be divisible by 32 (patch 16 x 2 windows), which is why the default is
    576 and not the plan's 560. Outputs: `dets` (1, 300, 4) normalised cx, cy, w, h and
    `labels` (1, 300, classes + 1) logits whose first columns are the classes in classmap order.
    """
    import rfdetr

    from auditor.detector import classmap

    cls = getattr(rfdetr, MODELS[model])
    detector = cls(
        num_classes=len(classmap.classes()),
        resolution=resolution,
        device="cpu",
        amp=False,
        pretrain_weights=str(checkpoint),
    )
    out.mkdir(parents=True, exist_ok=True)
    detector.export(
        output_dir=str(out),
        opset_version=OPSET,
        fp16=False,
        shape=(resolution, resolution),
        verbose=False,
    )
    onnx_files = sorted(out.glob("*.onnx"))
    if not onnx_files:
        raise RuntimeError(f"RF-DETR export produced no .onnx file in {out}")
    meta: dict[str, Any] = {
        "checkpoint": str(checkpoint),
        "model": model,
        "resolution": resolution,
        "opset": OPSET,
        "onnx": onnx_files[-1].name,
        "classes": classmap.classes(),
    }
    (out / "export.json").write_text(json.dumps(meta, indent=1))
    return onnx_files[-1]


def main() -> None:
    ap = argparse.ArgumentParser(description=export.__doc__)
    ap.add_argument("checkpoint", type=Path)
    ap.add_argument("--out", type=Path, default=Path("data/models/export"))
    ap.add_argument("--model", choices=sorted(MODELS), default="nano")
    ap.add_argument("--resolution", type=int, default=576)
    args = ap.parse_args()
    print(export(args.checkpoint, args.out, args.model, args.resolution))


if __name__ == "__main__":
    main()
