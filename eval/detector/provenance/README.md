# Detector training provenance

Copies of the small run records from `data/models/rfdetr-nano-full/` (the checkpoints and the 60 MB manifest stay in gitignored `data/`).

| file | what it is |
|---|---|
| `config.json` | settings written by `train.py` at the last start (the run was restarted several times; `config.json` is overwritten on each start, later versions keep the original and append `resumes`) |
| `training_config.json` | the full RF-DETR config of the last attempt (`resume=checkpoint_13.ckpt`): lr 1e-4, encoder lr 1.5e-4, AdamW, weight decay 1e-4, EMA decay 0.993, step scheduler, clip 0.1, multi-scale per batch |
| `manifest_summary.json` | manifest without the per-image items: seed, classes, shard SHA-256s, counts (15,000 / 1,500), boxes per class, filter counts, benchmark screening (110 pages, 16 bits, minimum kept distance 17), classmap sha, manifest sha256 `52c8c8057943db89...` |
| `metrics.csv` | per-step and per-epoch metrics for all 20 epochs (every restart appended to it) |
| `train_phase2_last_attempts.log` | `train.log` from 2026-10-11 15:54 on (the script began logging then); it contains a manual Ctrl-C of a first start at about 16:0x before the 16:08 start that resumed from `checkpoint_13` |

Software: rfdetr 1.11.2, pytorch-lightning, torch 2.14.1, Python 3.12.13, macOS 26.7 arm64, Apple M5 Pro 48 GB. Dataset: `biglab/webui-70k-elements` (the Hugging Face revision was not recorded; the shard file hashes are in `manifest_summary.json`).

## Restart table (2026-10-10 and 11)

| when | what | settings |
|---|---|---|
| 10-10 20:15 | first start, batch 8, 4 workers | no cap; stopped by the researcher after about 50 steps (40 GB, swap full) |
| 10-10 20:47 | micro-batch 4 x accumulation 2, 2 workers | no cap; stalled at step 1,099 after about 40 minutes (allocator cache growth) |
| 10-10 about 22:03 | phase 1 | code 375c338, batch 4 x 2, 2 workers, MPS cap 0.7 / 0.55 |
| 10-11 02:55 | phase 1 stopped in epoch 8 (step 14,149) | MPS out of memory against the 0.7 cap |
| 10-11 09:55 | phase 1 resumed from `checkpoint_6` | same settings |
| 10-11 11:52 | phase 1 finished (epoch 10) | |
| 10-11 11:58 | phase 2 from `checkpoint_9` | same settings |
| 10-11 15:11 | phase 2 stopped in epoch 15 (step 27,149) | cause not logged (probably the same out-of-memory) |
| 10-11 about 15:54 | start under the new logging script, interrupted by the researcher | |
| 10-11 16:08 | phase 2 resumed from `checkpoint_13`, retry script | code 476ef92, MPS cap 0.85 / 0.65 |
| 10-11 20:14 | phase 2 finished (epoch 20) | |

Resume is exact in data order, optimizer, scheduler and EMA (ADR-030) but MPS kernels are not bit-reproducible, so a rerun would give close, not identical, weights.
