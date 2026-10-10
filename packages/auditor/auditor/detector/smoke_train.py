from __future__ import annotations

import argparse
import json
import threading
import time
from pathlib import Path

from auditor.detector.train import environment, train

THROUGHPUT_FLOOR = 1.0


class PeakMemory:
    """Samples this process's resident memory and the MPS allocator while a job runs."""

    def __init__(self) -> None:
        self.rss_gb = 0.0
        self.mps_gb = 0.0
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        import psutil
        import torch

        proc = psutil.Process()
        while not self._stop.is_set():
            self.rss_gb = max(self.rss_gb, proc.memory_info().rss / 1e9)
            if torch.backends.mps.is_available():
                self.mps_gb = max(self.mps_gb, torch.mps.driver_allocated_memory() / 1e9)
            time.sleep(0.5)

    def __enter__(self) -> PeakMemory:
        self._thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self._stop.set()
        self._thread.join()


def run(
    dataset: Path, out: Path, images: int, batch_size: int, resolution: int
) -> dict[str, object]:
    result: dict[str, object] = {"images": images, "environment": environment(), "ok": False}
    started = time.time()
    try:
        with PeakMemory() as peak:
            train(dataset, out, "nano", 1, batch_size, resolution, num_workers=2)
        seconds = time.time() - started
        result.update(
            ok=True,
            seconds=round(seconds, 1),
            images_per_second=round(images / seconds, 2),
            peak_rss_gb=round(peak.rss_gb, 2),
            peak_mps_gb=round(peak.mps_gb, 2),
        )
    except ImportError as exc:
        result.update(error=f"ImportError: {exc}"[:500], seconds=round(time.time() - started, 1))
        result["decision"] = "dependency-missing (not a verdict on RF-DETR)"
        return result
    except Exception as exc:
        result.update(
            error=f"{type(exc).__name__}: {exc}"[:500], seconds=round(time.time() - started, 1)
        )
    rate = result.get("images_per_second", 0)
    throughput = float(rate) if isinstance(rate, int | float) else 0.0
    result["decision"] = (
        "rfdetr" if result["ok"] and throughput >= THROUGHPUT_FLOOR else "faster-rcnn-fallback"
    )
    return result


def main() -> None:
    ap = argparse.ArgumentParser(description="10-minute RF-DETR-on-MPS gate (200 images, 1 epoch)")
    ap.add_argument("--dataset", type=Path, default=Path("data/webui/smoke_v2"))
    ap.add_argument("--out", type=Path, default=Path("data/models/smoke"))
    ap.add_argument("--images", type=int, default=200)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--resolution", type=int, default=576)
    args = ap.parse_args()
    result = run(args.dataset, args.out, args.images, args.batch_size, args.resolution)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "smoke.json").write_text(json.dumps(result, indent=1))
    print(json.dumps(result, indent=1))


if __name__ == "__main__":
    main()
