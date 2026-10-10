# Milestone progress

Claude Code updates this file at the end of every milestone. Status: `todo` · `in-progress` · `done` · `blocked (reason)`.
**Order changed 2026-10-10 (ADR-012/013): follow the table top to bottom.**

| Milestone | Branch | Status | Merged | Notes |
|---|---|---|---|---|
| M0 scaffold | m0-scaffold | done | 2026-10-10 | acceptance + reviews passed; merged to main |
| M1 capture | m1-capture | done | 2026-10-10 | acceptance + reviews passed; merged to main |
| M2 rules + eval harness | m2-rules-eval | todo | | **Unblocked 2026-10-10:** GT sealed (`SEAL_LOG.md` line `benchmark \| GT`, sha256 b859a6de…e20). Baseline run: `baseline_runs/20261010T064722Z_snapshot` (errors=0). Do this next after M1b. Harness must implement ADR-013 matching (IoU or containment, duplicates merged). |
| M3 frames + DOM elements | m3-elements | done | 2026-10-10 | merged; real-page limitation → ADR-012 |
| M1b capture-time geometry | m1b-capture-geometry | done | 2026-10-10 | geometry_source capture/rerender/unavailable; goldens regenerated (see NOTES) |
| M4 static modules | m4-static-modules | todo | | synthetic via DomElementSource; acceptance on synthetic only. Modules take any `ElementSource` (do not assume DOM). |
| M5 focus + drag modules | m5-focus-modules | todo | | focus SCs use meta.json focus rects (all strata) |
| M10a OCR text source | m10a-ocr | todo | | ADR-012: RapidOCR (`ocr` extra, now core) → `PixelElementSource` text lines; 1.4.3 recall on real fixtures reported (no threshold) |
| M10 detector | m10-detector | todo | | GATE: researcher OK before overnight training. Now before M6 (ADR-012). Adds detector boxes to `PixelElementSource`. |
| M6 fusion + report | m6-fusion-report | todo | | element source chosen per capture (ADR-012) |
| M7a web shell | m7a-web-shell | todo | | carry-over from M0 review: axe gate AA→AA+AAA set (CLAUDE.md); input-border contrast; radius/type-scale remap; atomic report writes; job timeouts; CI `--all-packages` |
| M7b report screen | m7b-report | todo | | |
| M7c secondary screens | m7c-secondary-screens | todo | | |
| M8 full evaluation | m8-eval-run | todo | | report real and synthetic strata separately; IoU sweep with and without containment (ADR-013) |
| M9 study build | m9-study | todo | | GATE: ethics approval |
| M11 calibration (stretch) | m11-stretch | todo | | OCR moved to M10a |
