from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
from pathlib import Path
from typing import Any

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from auditor.detector import classmap  # noqa: E402

MODELS = {"nano": "RFDETRNano", "small": "RFDETRSmall"}


def build_model(model: str, resolution: int, device: str) -> Any:
    import rfdetr

    cls = getattr(rfdetr, MODELS[model])
    return cls(num_classes=len(classmap.classes()), resolution=resolution, device=device, amp=False)


def environment() -> dict[str, str]:
    import torch

    return {
        "platform": platform.platform(),
        "machine": platform.machine(),
        "python": platform.python_version(),
        "torch": torch.__version__,
        "mps_available": str(torch.backends.mps.is_available()),
        "pytorch_enable_mps_fallback": os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK", ""),
    }


def train(
    dataset_dir: Path,
    output_dir: Path,
    model: str = "nano",
    epochs: int = 20,
    batch_size: int = 8,
    resolution: int = 576,
    seed: int = 20261004,
    device: str = "mps",
    resume: Path | None = None,
    num_workers: int = 4,
) -> Path:
    """Fine-tune RF-DETR on a prepared WebUI dataset (Roboflow layout, see prepare_webui).

    Mixed precision is off (MPS fp16 is unreliable), EMA is on, a checkpoint is written every
    epoch and `resume` continues an interrupted run. Config, environment and the manifest hash
    are saved beside the weights.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = dataset_dir / "manifest.json"
    config = {
        "model": model,
        "epochs": epochs,
        "batch_size": batch_size,
        "resolution": resolution,
        "seed": seed,
        "device": device,
        "ema": True,
        "amp": False,
        "dataset_dir": str(dataset_dir),
        "manifest_sha256": hashlib.sha256(manifest.read_bytes()).hexdigest()
        if manifest.is_file()
        else None,
        "classmap": classmap.classes(),
        "environment": environment(),
    }
    (output_dir / "config.json").write_text(json.dumps(config, indent=1))
    detector = build_model(model, resolution, device)
    detector.train(
        dataset_dir=str(dataset_dir),
        epochs=epochs,
        batch_size=batch_size,
        grad_accum_steps=1,
        use_ema=True,
        seed=seed,
        output_dir=str(output_dir),
        checkpoint_interval=1,
        num_workers=num_workers,
        resume=str(resume) if resume else None,
        log_per_class_metrics=True,
        class_names=classmap.classes(),
    )
    return output_dir


def main() -> None:
    ap = argparse.ArgumentParser(description=train.__doc__)
    ap.add_argument("--dataset", type=Path, default=Path("data/webui/prepared"))
    ap.add_argument("--out", type=Path, default=Path("data/models/rfdetr-nano"))
    ap.add_argument("--model", choices=sorted(MODELS), default="nano")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--resolution", type=int, default=576)
    ap.add_argument("--seed", type=int, default=20261004)
    ap.add_argument("--device", default="mps")
    ap.add_argument("--resume", type=Path, default=None)
    args = ap.parse_args()
    train(
        args.dataset,
        args.out,
        args.model,
        args.epochs,
        args.batch_size,
        args.resolution,
        args.seed,
        args.device,
        args.resume,
    )


if __name__ == "__main__":
    main()
