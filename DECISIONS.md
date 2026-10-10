# Architecture decision records

Format: context → options → decision → evidence → consequences. Dates are when the decision was taken. Add new ADRs at the bottom; never rewrite old ones.

## ADR-001 Detector: RF-DETR Nano/Small instead of YOLOv8 (2026-10-10)
Context: Chapter 3 names YOLOv8 (DETR as alternative). Options: Ultralytics YOLO (AGPL-3.0), OmniParser icon detector (AGPL weights), RF-DETR (Apache-2.0 for Nano/Small/Medium; XL/2XL under a different licence), ScreenParser (Apache label on a YOLO11 base, licence unclear). Decision: RF-DETR Nano (Small if time allows), ONNX inference. Evidence: licence; Hugging Face transformers tutorial fine-tunes RF-DETR on mobile UI screenshots; RF100-VL domain-adaptation results. Consequences: note the mutability clause in the thesis; supervisor to be informed.

## ADR-002 DOM-first element source; detector for screenshot-only mode and ablation (2026-10-10)
Context: the benchmark always has a DOM; the detector was on the critical path of every module. Decision: `DomElementSource` is the default; `DetectorElementSource` serves uploads and an ablation table. Consequences: RQ2's "where does the pixel channel fail" is answered with the ablation; Chapter 4 must report both.

## ADR-003 SQLite + in-process runner instead of Postgres + Redis + arq (2026-10-10)
Context: single laptop, one user, ~400 captures; arq is maintenance-only. Decision: SQLite, FastAPI background job table, auditor in a subprocess. Consequences: no horizontal scaling (not needed); simpler study deployment.

## ADR-004 Protocol v1.1 is the auditor's rulebook; one `protocol.yaml` (2026-10-10)
Context: five copies of the thresholds existed across tooling. Decision: a single YAML loaded by modules, fusion, harness and the synthetic generator; a test forbids literals in `modules/`. Note: the 2.5.8 inline exception is implemented as "inside a prose line box" (WCAG reading), which is stricter than the O3 calibration reading for "Tags: a, b, c" lines; the ground truth followed O3, so the harness may show a small 2.5.8 precision cost. Record it in Chapter 5.

## ADR-005 Version pins follow the benchmark (2026-10-10)
Playwright 1.63.0, Chromium 153.0.8010.12, axe-core 4.13.0 (vendored copy, sha256 asserted). Reason: M2 reproduction of the baseline.

## ADR-006 Focus criteria are scored per focus stop (2026-10-10)
Ground truth stores `focus_judgments` per stop; IoU matching does not apply. Fusion and harness key 2.4.x findings by `focus_index`.

## ADR-007 Three tiers instead of "calibrated confidence" (2026-10-10)
`automated`, `needs-review`, `not-assessable` per finding and per coverage cell; a raw module score is kept. Calibration (reliability diagram) is a stretch item (M11).

## ADR-008 Chromium `page.pdf()` instead of WeasyPrint; RapidOCR optional (2026-10-10)
Fewer system dependencies; OCR only for screenshot-only mode.

## ADR-009 Detector training on the researcher's local Mac (2026-10-10)
Context: no Colab or university GPU. Options: local Apple silicon via PyTorch MPS; cloud GPU; skip the detector. Decision: local MPS training with a mandatory 10-minute smoke run first. Hardware: Apple M5 Pro, 48 GB, so the full recipe applies (Nano at 560 px, 15k images, 20 epochs; then Small if Nano meets target); torchvision Faster R-CNN as the fallback if RF-DETR does not train on MPS. Consequences: shipped inference remains ONNX on CPU; the Mac must stay awake and free during training; results are reported with the hardware and wall time.

## ADR-010 Light-theme muted text is zinc-600, not zinc-500 (2026-10-10)
Context: DESIGN_SPEC §1 gives text-muted `zinc-500` (#71717a). On `muted`/`secondary`/`accent` surfaces (#f4f4f5) that is 4.40:1, below the 4.5:1 the app's own axe gate requires for 12-13 px text. Options: keep zinc-500 and restrict it to background/card; darken the token. Decision: `--muted-foreground` is #52525b (7.4:1 on #f4f4f5). Dark theme unchanged (#a1a1aa, 5.8:1 on #27272a). Evidence: M0 a11y review, computed ratios. Consequence: DESIGN_SPEC §1 should be updated by the researcher; the spec's severity ratio column is also slightly off (computed on zinc-50: serious 4.81, minor 6.42, critical 6.2; all still pass AA).

## ADR-011 Protocol heuristics live in a separate `heuristics` block (2026-10-10)
Context: 24 (changed-pixel delta, sliding window), 0.05 (unsettled fraction) and 25 (obscured sample points) come from PLAN §4.3, not Protocol v1.1. Decision: `protocol.yaml` keeps them under `heuristics`, apart from `thresholds`, so Chapter 3/4 can state which values are protocol and which are implementation choices.
