import json
import random
from pathlib import Path
from typing import Any

import pytest
from auditor.detector import classmap
from PIL import Image, ImageDraw

pytestmark = pytest.mark.ml

SIZE = 224


def make_dataset(root: Path, train: int = 6, valid: int = 4, seed: int = 3) -> Path:
    rng = random.Random(seed)
    names = classmap.classes()
    for split, count in (("train", train), ("valid", valid)):
        (root / split).mkdir(parents=True)
        images: list[dict[str, Any]] = []
        annotations: list[dict[str, Any]] = []
        for i in range(1, count + 1):
            img = Image.new("RGB", (SIZE, SIZE), (245, 245, 245))
            draw = ImageDraw.Draw(img)
            for _ in range(3):
                x, y = rng.randint(5, 120), rng.randint(5, 150)
                w, h = rng.randint(30, 90), rng.randint(14, 40)
                cat = rng.randrange(len(names))
                draw.rectangle([x, y, x + w, y + h], outline=(30 + 30 * cat, 40, 90), width=2)
                annotations.append(
                    {
                        "id": len(annotations) + 1, "image_id": i, "category_id": cat,
                        "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0,
                    }
                )  # fmt: skip
            img.save(root / split / f"{i:04d}.png")
            images.append({"id": i, "file_name": f"{i:04d}.png", "width": SIZE, "height": SIZE})
        coco = {
            "images": images,
            "annotations": annotations,
            "categories": [{"id": k, "name": n} for k, n in enumerate(names)],
        }
        (root / split / "_annotations.coco.json").write_text(json.dumps(coco))
    return root


def latest_checkpoint(out: Path) -> Path:
    found = sorted(out.glob("checkpoint_*.ckpt"), key=lambda p: int(p.stem.split("_")[1]))
    assert found, f"no checkpoint in {out}: {sorted(p.name for p in out.iterdir())}"
    return found[-1]


def weights(path: Path) -> dict[str, Any]:
    import torch

    state = torch.load(path, map_location="cpu", weights_only=False)
    return {k: v for k, v in state["state_dict"].items() if hasattr(v, "shape")}


def assert_tree_equal(x: Any, y: Any) -> None:
    import torch

    if isinstance(x, dict):
        assert x.keys() == y.keys()
        for k in x:
            assert_tree_equal(x[k], y[k])
    elif isinstance(x, list | tuple):
        assert len(x) == len(y)
        for p, q in zip(x, y, strict=True):
            assert_tree_equal(p, q)
    elif isinstance(x, torch.Tensor):
        assert torch.equal(x, y)
    else:
        assert x == y


@pytest.mark.parametrize("workers", [0, 2])
def test_three_epochs_equal_two_epochs_plus_a_resumed_epoch(tmp_path: Path, workers: int) -> None:
    import torch
    from auditor.detector.train import train

    data = make_dataset(tmp_path / "data")
    common: dict[str, Any] = {
        "model": "nano", "epochs": 3, "batch_size": 2, "resolution": SIZE,
        "seed": 11, "device": "cpu", "num_workers": workers,
    }  # fmt: skip
    straight = train(data, tmp_path / "straight", **common)
    phase = train(data, tmp_path / "phased", stop_after_epoch=2, **common)
    first = latest_checkpoint(phase)
    assert first.stem == "checkpoint_1"
    first_bytes = first.read_bytes()
    train(data, tmp_path / "phased", resume=first, **common)
    assert first.read_bytes() == first_bytes

    a, b = weights(latest_checkpoint(straight)), weights(latest_checkpoint(tmp_path / "phased"))
    assert a.keys() == b.keys() and len(a) > 100
    first_epoch = weights(straight / "checkpoint_0.ckpt")
    assert all(torch.equal(first_epoch[k], weights(phase / "checkpoint_0.ckpt")[k]) for k in a)
    final_a = torch.load(latest_checkpoint(straight), map_location="cpu", weights_only=False)
    final_b = torch.load(
        latest_checkpoint(tmp_path / "phased"), map_location="cpu", weights_only=False
    )
    assert final_a["epoch"] == final_b["epoch"] == 2
    assert final_a["global_step"] == final_b["global_step"]
    assert len(final_a["optimizer_states"][0]["state"]) > 0
    assert_tree_equal(final_a["optimizer_states"], final_b["optimizer_states"])
    assert_tree_equal(final_a["lr_schedulers"], final_b["lr_schedulers"])
    assert final_a["callbacks"]["RFDETREMACallback"]
    assert_tree_equal(
        final_a["callbacks"]["RFDETREMACallback"], final_b["callbacks"]["RFDETREMACallback"]
    )
    assert any(not torch.equal(a[k], first_epoch[k]) for k in a)
    different = [k for k in a if not torch.equal(a[k], b[k])]
    assert different == []


def test_a_mid_phase_restart_resumes_from_the_latest_checkpoint(tmp_path: Path) -> None:
    from auditor.detector.train import resolve_resume, train

    data = make_dataset(tmp_path / "data")
    common: dict[str, Any] = {
        "model": "nano", "batch_size": 2, "resolution": SIZE,
        "seed": 11, "device": "cpu", "num_workers": 0,
    }  # fmt: skip
    straight = train(data, tmp_path / "straight", epochs=4, **common)
    run = tmp_path / "run"
    assert resolve_resume(run, 4, 2) is None
    train(data, run, epochs=4, stop_after_epoch=1, **common)
    interrupted = resolve_resume(run, 4, 2)
    assert interrupted == run / "checkpoint_0.ckpt"
    train(data, run, epochs=4, stop_after_epoch=2, resume=interrupted, **common)
    with pytest.raises(SystemExit):
        resolve_resume(run, 4, 2)
    phase2 = resolve_resume(run, 4, None)
    assert phase2 == run / "checkpoint_1.ckpt"
    before = (run / "checkpoint_1.ckpt").read_bytes()
    train(data, run, epochs=4, resume=phase2, **common)
    assert (run / "checkpoint_1.ckpt").read_bytes() == before
    with pytest.raises(SystemExit):
        resolve_resume(run, 4, None)

    import torch

    a, b = weights(latest_checkpoint(straight)), weights(latest_checkpoint(run))
    assert latest_checkpoint(run).stem == "checkpoint_3"
    assert [k for k in a if not torch.equal(a[k], b[k])] == []
