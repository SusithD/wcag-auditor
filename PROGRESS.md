# Milestone progress

Claude Code updates this file at the end of every milestone. Status: `todo` · `in-progress` · `done` · `blocked (reason)`.
**Order changed 2026-10-10 (ADR-012/013): follow the table top to bottom.**

| Milestone | Branch | Status | Merged | Notes |
|---|---|---|---|---|
| M0 scaffold | m0-scaffold | done | 2026-10-10 | acceptance + reviews passed; merged to main |
| M1 capture | m1-capture | done | 2026-10-10 | acceptance + reviews passed; merged to main |
| M2 rules + eval harness | m2-rules-eval | done | 2026-10-10 | rule_only byte-equal to baseline golden (5/5 fixtures, 40/40 random synth); make eval reproducible (sha 9ee96346…); see NOTES M2, ADR-014/015 |
| M3 frames + DOM elements | m3-elements | done | 2026-10-10 | merged; real-page limitation → ADR-012 |
| M1b capture-time geometry | m1b-capture-geometry | done | 2026-10-10 | geometry_source capture/rerender/unavailable; goldens regenerated (see NOTES) |
| M4 static modules | m4-static-modules | done | 2026-10-10 | synthetic desktop: 1.4.3 15/15, 1.4.11 20/20, 2.5.8 52/52, 0 FP (pinned test); ADR-016; pixel condition in eval |
| M5 focus + drag modules | m5-focus-modules | done | 2026-10-10 | synthetic corpus 8/8 SCs recall=precision=1.0 (pinned); real-stratum 2.4.7 P.68 R.67, 2.4.13 P.75 R.40 (exempt) / P.72 R.88 (evaluate default ring); ADR-017 |
| M10a OCR text source | m10a-ocr | done | 2026-10-10 | RapidOCR line boxes: synthetic 15/15 truth blocks, ~0.7 s/page; real stratum 1.4.3 (needs-review included) P .78 R .82; default policy R .01 (tier policy, not geometry); ADR-012 source selection |
| M10 detector | m10-detector | in-progress (2026-10-11: trained, epoch-20 EMA mAP 50:95 0.251 on WebUI valid, ONNX mAP 0.239 (`eval/detector/`), ablation in `eval/2026-10-11/`; pending the label-noise hand check (needs the researcher), review fixes, merge) | | Code, 15k/1.5k data prep, smoke gate (RF-DETR OK, 2.23 img/s, 27 GB MPS), ONNX path, screenshot-only run are done and tested on branch m10-detector (committed, NOT merged: acceptance needs the trained model). Pending: training run, mAP report, ablation, label-noise check. |
| M6 fusion + report | m6-fusion-report | done | 2026-10-10 | hybrid non-inferior on 1.4.3 (ΔP CI [-0.029,-0.002]); real fixtures 4 automated / 5 any (ADR-021, ADR-022) |
| M7a web shell + New Audit + progress | m7a-web-shell | done | 2026-10-10 | 13 e2e incl. axe zero violations on `/` and run progress, keyboard-only run; focus-pair upload, favicon, per-module boxes NOT DONE (ADR-023) |
| M7b report screen | m7b-report-screen | done (manual screen-reader pass pending) | 2026-10-10 | 25 e2e incl. axe on both fixtures, keyboard and URL-state tests, 1440x900 snapshot; manual VoiceOver/NVDA pass NOT DONE (ADR-024) |
| M7c coverage, compare, evaluation | m7c-secondary-screens | done | 2026-10-10 | 40 e2e incl. axe on coverage, compare, eval and /eval from eval/fixtures; H1 McNemar pair corrected and evaluation rerun (ADR-025) |
| M8 full evaluation | m8-eval-run | done | 2026-10-10 | make eval twice byte-identical (sha cfa9c78a); figures, taxonomy and 10-page re-capture check (Dice 0.775, confounded by element source) (ADR-026) |
| M8b re-evaluation with ADR-028 | m8b-reeval | done | 2026-10-10 | headline both tiers + default ring evaluated; automated-only and ring-exempt secondary tables; make eval twice identical (sha 967b6795); H1 non-inferiority on 1.4.3 no longer shown under both tiers (ΔP [-0.070, +0.042]) |
| M9 study build | m9-study | done (synthetic participants only) | 2026-10-10 | full AB session e2e, timing/SUS/rubric exports, parity and rule-only honesty tests; real task pages and ethics approval NOT DONE (ADR-028 section 4, ADR-029) |
| M11 calibration (stretch) | m11-calibration | done | 2026-10-10 | ECE/Brier/reliability for pixel and hybrid; hybrid real ECE 0.253, pixel real 0.144; no recalibration (ADR-027); OCR half done in M10a |
