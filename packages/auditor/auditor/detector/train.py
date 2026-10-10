from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import random
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

from auditor.detector import classmap  # noqa: E402

MODELS = {"nano": "RFDETRNano", "small": "RFDETRSmall"}


MASK = 2**31 - 1


def epoch_seed(seed: int, epoch: int, salt: int = 0) -> int:
    """Seed of one epoch (and one random-number consumer): a pure function of the run seed, so
    an epoch draws the same shuffles, augmentations and dropout masks whether the run reached
    it straight or through a checkpoint (ADR-028 section 3)."""
    return (seed * 1_000_003 + epoch * 7_919 + salt * 104_729) & MASK


def find_composes(
    obj: Any, found: list[Any] | None = None, seen: set[int] | None = None
) -> list[Any]:
    """Every Albumentations pipeline reachable from a dataset, in a deterministic order."""
    import albumentations as alb

    found = [] if found is None else found
    seen = set() if seen is None else seen
    if id(obj) in seen or isinstance(obj, str | bytes | int | float | bool | type(None)):
        return found
    seen.add(id(obj))
    if isinstance(obj, alb.Compose):
        found.append(obj)
        return found
    if isinstance(obj, dict):
        children = list(obj.values())
    elif isinstance(obj, list | tuple):
        children = list(obj)
    elif hasattr(obj, "__dict__") and type(obj).__module__.split(".")[0] in {"rfdetr", "torch"}:
        children = list(vars(obj).values())
    else:
        return found
    for child in children:
        find_composes(child, found, seen)
    return found


class SeededDataset:
    """Training dataset whose every sample is augmented from (run seed, epoch, index) alone, so a
    sample is identical for any worker count, prefetch depth or resume point. The epoch lives in
    shared memory because DataLoader workers are created before the epoch hooks run."""

    def __init__(self, inner: Any, seed: int, epoch: int) -> None:
        import torch

        self.inner = inner
        self.seed = seed
        self.epoch = torch.full((1,), epoch, dtype=torch.int64).share_memory_()  # type: ignore[no-untyped-call]
        self.composes: list[Any] | None = None

    def set_epoch(self, epoch: int) -> None:
        self.epoch[0] = epoch

    def __len__(self) -> int:
        return len(self.inner)

    def __getattr__(self, name: str) -> Any:
        if name in {"inner", "seed", "epoch", "composes"} or name.startswith("__"):
            raise AttributeError(name)
        return getattr(self.inner, name)

    def __getitem__(self, index: int) -> Any:
        import numpy as np
        import torch

        if self.composes is None:
            self.composes = find_composes(self.inner)
        salt = 1_000 + int(index)
        epoch = int(self.epoch[0])
        torch_state, numpy_state, python_state = (
            torch.get_rng_state(),
            np.random.get_state(),
            random.getstate(),
        )
        try:
            torch.manual_seed(epoch_seed(self.seed, epoch, salt))
            np.random.seed(epoch_seed(self.seed, epoch, salt + 1_000_000))
            random.seed(epoch_seed(self.seed, epoch, salt + 2_000_000))
            for k, compose in enumerate(self.composes):
                compose.set_random_seed(epoch_seed(self.seed, epoch, salt + 3_000_000 + k))
            return self.inner[index]
        finally:
            torch.set_rng_state(torch_state)
            np.random.set_state(numpy_state)
            random.setstate(python_state)


class RunState:
    seed = 0
    epoch = 0


def epoch_sampler_class() -> type:
    import torch
    from torch.utils.data import RandomSampler

    class EpochRandomSampler(RandomSampler):
        """Draws its permutation from (run seed, epoch) alone: with workers the sampler starts
        iterating when the loader iterator is created, before any epoch hook can seed it."""

        def __iter__(self) -> Iterator[int]:
            self.generator = torch.Generator().manual_seed(
                epoch_seed(RunState.seed, RunState.epoch, 99)
            )
            return super().__iter__()

    return EpochRandomSampler


def make_callbacks(seed: int, stop_after_epoch: int | None, start_epoch: int = 0) -> list[Any]:
    from pytorch_lightning import Callback

    class EpochSeed(Callback):
        def setup(self, trainer: Any, pl_module: Any, stage: str) -> None:
            RunState.seed, RunState.epoch = seed, start_epoch
            import torch

            torch.manual_seed(epoch_seed(seed, start_epoch))
            dm: Any = getattr(trainer, "datamodule", None)
            if stage == "fit" and getattr(dm, "_dataset_train", None) is not None:
                dm._dataset_train = SeededDataset(dm._dataset_train, seed, start_epoch)

        def reseed(self, trainer: Any) -> None:
            import numpy as np
            import torch

            dataset = getattr(getattr(trainer, "datamodule", None), "_dataset_train", None)
            if not isinstance(dataset, SeededDataset):
                raise RuntimeError("training dataset was not wrapped for exact resume")
            epoch = trainer.current_epoch
            dataset.set_epoch(epoch)
            torch.manual_seed(epoch_seed(seed, epoch))
            np.random.seed(epoch_seed(seed, epoch, 1))
            random.seed(epoch_seed(seed, epoch, 2))
            RunState.epoch = epoch

        def on_train_start(self, trainer: Any, pl_module: Any) -> None:
            self.reseed(trainer)

        def on_train_epoch_start(self, trainer: Any, pl_module: Any) -> None:
            self.reseed(trainer)

    class StopAfterEpoch(Callback):
        def on_train_epoch_end(self, trainer: Any, pl_module: Any) -> None:
            if stop_after_epoch is not None and trainer.current_epoch + 1 >= stop_after_epoch:
                trainer.should_stop = True

    return [EpochSeed(), StopAfterEpoch()]


@contextmanager
def extra_callbacks(callbacks: list[Any]) -> Iterator[None]:
    """rfdetr builds its Lightning trainer inside `train()`; add ours to it."""
    import rfdetr.training as rt
    import torch.utils.data as tud
    import torch.utils.data.dataloader as tud_loader

    original = rt.build_trainer
    modules: tuple[Any, ...] = (tud, tud_loader)
    originals = [m.RandomSampler for m in modules]
    sampler = epoch_sampler_class()

    def patched(*args: Any, **kwargs: Any) -> Any:
        trainer = original(*args, **kwargs)
        trainer.callbacks.extend(callbacks)  # type: ignore[attr-defined]
        return trainer

    rt.build_trainer = patched
    for m in modules:
        m.RandomSampler = sampler
    try:
        yield
    finally:
        rt.build_trainer = original
        for m, original_sampler in zip(modules, originals, strict=True):
            m.RandomSampler = original_sampler


def resolve_resume(out: Path, epochs: int, stop_after_epoch: int | None) -> Path | None:
    """Latest per-epoch checkpoint in `out`, or None for a fresh start. Refuses when the phase
    (or the whole run) is already complete, so a restart can never overwrite later checkpoints."""
    found = sorted(
        (int(p.stem.split("_")[1]), p)
        for p in out.glob("checkpoint_*.ckpt")
        if p.stem.split("_")[1].isdigit()
    )
    if not found:
        return None
    done, path = found[-1][0] + 1, found[-1][1]
    limit = min(epochs, stop_after_epoch) if stop_after_epoch is not None else epochs
    if done >= limit:
        raise SystemExit(f"{path.name} already covers {done} epochs; this phase ends at {limit}")
    return path


def check_resume_config(out: Path, current: dict[str, Any]) -> None:
    """A resumed phase must use the settings that wrote the checkpoint."""
    recorded_path = out / "config.json"
    if not recorded_path.is_file():
        return
    recorded = json.loads(recorded_path.read_text())
    changed = {k: (recorded.get(k), v) for k, v in current.items() if recorded.get(k) != v}
    if changed:
        raise SystemExit(f"resume settings differ from {recorded_path}: {changed}")


def checkpoint_epoch(path: Path | None) -> int:
    if path is None:
        return 0
    import torch

    state = torch.load(path, map_location="cpu", weights_only=False)
    return int(state["epoch"]) + 1


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
    stop_after_epoch: int | None = None,
    grad_accum: int = 1,
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
        "grad_accum": grad_accum,
        "num_workers": num_workers,
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
    from pytorch_lightning import seed_everything

    seed_everything(seed, workers=True)
    detector = build_model(model, resolution, device)
    with extra_callbacks(make_callbacks(seed, stop_after_epoch, checkpoint_epoch(resume))):
        _fit(
            detector,
            dataset_dir,
            output_dir,
            epochs,
            batch_size,
            seed,
            resume,
            num_workers,
            device,
            grad_accum,
        )
    return output_dir


def _fit(
    detector: Any,
    dataset_dir: Path,
    output_dir: Path,
    epochs: int,
    batch_size: int,
    seed: int,
    resume: Path | None,
    num_workers: int,
    device: str,
    grad_accum: int,
) -> None:
    detector.train(
        device=device,
        dataset_dir=str(dataset_dir),
        epochs=epochs,
        batch_size=batch_size,
        grad_accum_steps=grad_accum,
        use_ema=True,
        seed=seed,
        output_dir=str(output_dir),
        checkpoint_interval=1,
        num_workers=num_workers,
        resume=str(resume) if resume else None,
        persistent_workers=False,
        log_per_class_metrics=True,
        class_names=classmap.classes(),
    )


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
    ap.add_argument("--num-workers", type=int, default=4)
    ap.add_argument("--grad-accum", type=int, default=1)
    ap.add_argument("--resume", type=Path, default=None)
    ap.add_argument(
        "--resume-latest",
        action="store_true",
        help="resume from the newest checkpoint_N.ckpt in --out if there is one",
    )
    ap.add_argument(
        "--stop-after-epoch",
        type=int,
        default=None,
        help="stop cleanly after this epoch; the schedule still covers --epochs (ADR-028)",
    )
    args = ap.parse_args()
    if args.batch_size < 1 or args.grad_accum < 1 or args.num_workers < 0:
        ap.error("--batch-size and --grad-accum must be at least 1, --num-workers at least 0")
    if args.resume_latest:
        if args.resume is not None:
            ap.error("--resume and --resume-latest are exclusive")
        args.resume = resolve_resume(args.out, args.epochs, args.stop_after_epoch)
    if args.resume is not None:
        check_resume_config(
            args.out,
            {
                "model": args.model,
                "epochs": args.epochs,
                "batch_size": args.batch_size,
                "grad_accum": args.grad_accum,
                "resolution": args.resolution,
                "seed": args.seed,
            },
        )
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
        num_workers=args.num_workers,
        grad_accum=args.grad_accum,
        stop_after_epoch=args.stop_after_epoch,
    )


if __name__ == "__main__":
    main()
