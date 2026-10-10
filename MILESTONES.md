# Milestones: Claude Code task prompts

Each milestone is one Claude Code session on its own branch. Paste the prompt as-is. Every prompt assumes the repo root contains `CLAUDE.md`, `PLAN.md`, `DESIGN_SPEC.md`, `CHECK_CATALOGUE.md`, `DECISIONS.md` (copied from this folder).

Template:
```
Milestone M<N>: <goal>. Branch m<N>-<slug>. Read CLAUDE.md and PLAN.md §<sections> first.
Context: <what exists; files to read; what not to touch>.
Deliver: <numbered files/functions with exact names and signatures>.
Acceptance (all must pass before you report done): <exact commands + expected outputs>.
Out of scope: <list>. If blocked by ambiguity, take the Protocol v1.1 reading and note it in NOTES.md.
Finish with: tests run, numbers achieved, deviations from PLAN, ADRs added.
```

---

## M0: scaffold
```
Milestone M0: scaffold the monorepo. Branch m0-scaffold. Read CLAUDE.md and PLAN.md §2, §3, §5.
Context: empty repo. The frozen benchmark is at $BENCHMARK_DIR (read-only). Copy ../04_Data_Collection/vendor/axe.min.js and record its sha256.
Deliver:
1. uv workspace: packages/auditor (lib + Typer CLI `auditor` with `run`, `capture`, `eval` stubs), services/app (FastAPI with /health, SQLite via SQLAlchemy 2 + Alembic, in-process job runner skeleton).
2. packages/auditor/auditor/schema.py: Pydantic v2 models Finding(sc, bbox|None, focus_index|None, severity, tier, score, provenance, evidence, guidance_key), Capture, Run, Coverage, mirrored from the ground-truth JSON shape in fixtures/README.md.
3. packages/auditor/auditor/protocol.yaml with all Protocol v1.1 thresholds (contrast 4.5/3.0, large text 24 / 18.66@700, non-text 3.0, target 24, visibility 1.5, ring 2px, area 4(w+h), IoU 0.3, containment 0.5, severity rules, R1–R6, O1–O8 flags) and a loader `auditor.protocol.load()`.
4. fixtures/: copy 3 synthetic desktop capture folders (one each for 1.4.3, 2.4.13, 2.5.8, with truth.json) and 2 real folders (one desktop, one non-responsive mobile) from the benchmark, PNGs downscaled only if > 200 KB (keep originals for the mobile one); fixtures/README.md documents the folder layout and meta.json keys.
5. apps/web: `pnpm create next-app@latest apps/web --ts --app --tailwind --biome --src-dir --import-alias "@/*" --react-compiler --use-pnpm --yes`; `pnpm dlx shadcn@latest init -b base`; add button, input, tabs, table, tooltip, dialog, alert-dialog, sheet, resizable, toggle-group, badge, skeleton, scroll-area, dropdown-menu, context-menu, collapsible, popover, chart, kbd. Geist fonts, theme provider with light/dark, tokens from DESIGN_SPEC §1.
6. Makefile targets check / smoke / eval / goldens / gen-types; .env.example; .gitattributes (LFS for *.onnx); CI workflow running make check.
7. A test that fails if any literal 4.5, 3.0, 24, 1.5 appears in packages/auditor/auditor/modules/ (empty for now).
Acceptance: `make check` green; `make smoke` runs the stub pipeline on a fixture and writes report.json validating against schema; `curl localhost:8000/health` → ok; `pnpm -C apps/web build` succeeds; `@axe-core/playwright` on `/` → 0 violations.
Out of scope: any real module logic.
```

## M1: capture port + replay
```
Milestone M1: port the capture layer. Branch m1-capture. Read PLAN.md §1.1, §2, §4.2; read ../04_Data_Collection/capture_and_select.py (PlaywrightBrowser, step_focus, FOCUS_START_JS, FOCUS_INFO_JS, LAYOUT_JS, capture_page) and validate_captures.py.
Deliver: auditor/capture/driver.py (same viewports, DSF 1, contexts), focus.py (sentinel start, uid cycle detection, iframe skip, press budget, png_scale), snapshot.py (port of run_baseline.snapshot_html), `auditor capture <url> --out <dir> --viewports desktop,mobile` writing the v2.4.0 folder layout + VERSIONS.json; `auditor run --folder <capture dir>` replay mode that loads an existing folder.
Acceptance: `uv run pytest packages/auditor -m browser -k capture`; running `python ../04_Data_Collection/validate_captures.py <out>` on a capture of fixtures/sites/static.html (serve with python -m http.server) reports 0 errors; meta.json keys ⊇ the v2.4.0 set listed in fixtures/README.md; VERSIONS.json shows playwright 1.63.0 and chromium 153.
Out of scope: rules, modules.
```

## M2: rule channel + harness
```
Milestone M2: rule channel and evaluation harness. Branch m2-rules-eval. Read PLAN.md §1.2, §8; read ../04_Data_Collection/run_baseline.py and annotation/agreement.py (units, kappa, iou).
Deliver: auditor/rules/axe.py (inject vendor/axe.min.js, WCAG 2.2 ruleset, rules color-contrast and target-size, boxes in document CSS px), rulemap.py; auditor/eval/units.py (port stop_positive, page_positives, iou; excluded stops; R6 not-assessable), metrics.py (TP/FP/FN, P/R/F1 per SC, stratum, condition), bootstrap.py (10,000 resamples over pages, seeded), mcnemar.py (statsmodels, degenerate-case message), tables.py (md + tex), failures.py; `auditor eval` CLI.
Acceptance: `auditor run --folder <each fixture> --condition rule_only` findings byte-equal to fixtures/baseline_golden/* (generated once from baseline_runs snapshot mode on those folders; commit the golden and its source run id); `uv run pytest -k eval` includes a toy-truth test with hand-computed P/R and a focus-stop unit test; `auditor eval` on fixtures prints a table and writes metrics.json with benchmark/truth/protocol SHAs and seed.
Out of scope: pixel modules.
```

## M3: frames + DOM element source + page features
```
Milestone M3: coordinate frames and DOM element source. Branch m3-elements. Read PLAN.md §4.1, §4.2, §5 (page_features); read annotation/sa_tools.py crop_for/fdiff for the png_scale maths.
Deliver: auditor/frames.py (Frame with css→png, png→css, viewport→document using scroll and png_scale; areas scale by png_scale²); auditor/elements/base.py (Element, ElementSource protocol); elements/dom.py (interactive elements, text line boxes via Range.getClientRects, computed color/font-size/font-weight, fixed/sticky regions with alpha, role=slider / input[type=range], disabled, native-unstyled flag); auditor/features.py (edge density, element density, focus-stop count, has_sticky, is_non_responsive).
Acceptance: round-trip test on the non-responsive mobile fixture matches sa_tools.crop_for within 1 px; element dump golden for each fixture; `uv run pytest -k "frames or elements"` green.
Out of scope: detector.
```

## M4: static modules
```
Milestone M4: modules 1.4.3, 1.4.11, 2.5.8. Branch m4-static-modules. Read PLAN.md §4.3 rows 1.4.3 / 1.4.11 / 2.5.8, CHECK_CATALOGUE.md, protocol.yaml; read annotation/sa_tools.py (ratio, lum) and ../04_Data_Collection/validate_captures.py (24-px circle test).
Context: elements come from DomElementSource (M3). Fixtures at fixtures/synth/<sc>/ with truth.json. Thresholds only from protocol.yaml.
Deliver: modules/context.py (ModuleContext: capture, elements, frame, protocol), modules/sc_1_4_3.py, sc_1_4_11.py, sc_2_5_8.py with run(ctx) -> list[Finding]; evidence keys per PLAN §4.3 (ratio, fg, bg, large_text, size_px, exception_tested); tiers per §4.3; tests/test_sc_*.py.
Acceptance: `uv run pytest -k "sc_1_4_3 or sc_1_4_11 or sc_2_5_8"` green; `auditor eval --benchmark fixtures/synth --synthetic-truth from-folders` prints element-level recall ≥ 0.90 and precision ≥ 0.90 for each of the three SCs (desktop captures); the literal-threshold test passes; colour math equals sa_tools.ratio on the 7 test vectors in tests/vectors.json.
Out of scope: focus modules, OCR, fusion.
```

## M5: focus and drag modules
```
Milestone M5: modules 2.4.7, 2.4.11/2.4.12, 2.4.13, 2.5.7. Branch m5-focus-modules. Read PLAN.md §4.3 rows for these SCs, Protocol v1.1 amendments R1–R6/O1/O4 (in CHECK_CATALOGUE.md); read annotation/sa_tools.py cmd_fdiff and annotation/adj_tools.py fdiff (pad handling).
Deliver: modules/sc_2_4_7.py (changed-pixel mask, Δ>24, max state contrast ≥ visibility threshold; unsettled flag), sc_2_4_11_12.py (coverage fraction via fixed/sticky boxes + 25-point hit test; pixel fallback), sc_2_4_13.py (added-indicator mask; ring connectivity; thickness via cv2.distanceTransform; R5 then O4; unstyled default ring = meets), sc_2_5_7.py (DOM-only; native range = pass; custom without single-pointer alternative = fail, severity critical; no DOM → not-assessable). All units are focus stops keyed by focus_index; bbox = rect + scroll in document px.
Acceptance: synthetic recall ≥ 0.90 and precision ≥ 0.90 per SC on fixtures/synth; fixture tests for R5 (2 px solid ring slightly under 4(w+h) → meets) and O4 (colour change with area short → fails); non-responsive mobile fixture areas computed in CSS px (test); `make check` green.
Out of scope: fusion, UI.
```

## M6: fusion, coverage, report
```
Milestone M6: fusion, tiers, coverage matrix, report. Branch m6-fusion-report. Read PLAN.md §1.4–1.6, §4.3 (tiers), §6 report endpoints, DESIGN_SPEC §2 right pane (evidence/fix content).
Deliver: fusion/match.py (same SC; IoU ≥ protocol.iou or containment ≥ protocol.containment; provenance rule|pixel|both; de-dup), fusion/tiers.py, fusion/coverage.py (per SC verdict per channel; reliable-verdict count); report/guidance.yaml (per SC: what failed, nearest passing value where computable, HTML/CSS snippet, W3C Understanding + technique links); report/build.py → report.json (+ crops per finding), report/template.html (self-contained, same tokens as the web app), report/pdf.py via Chromium page.pdf(); `auditor run --condition hybrid|rule_only`.
Acceptance: `auditor run --folder` on the 2 real fixtures in both conditions produces report.json/html/pdf; coverage shows rule-only reliable count = 2 and hybrid ≥ 6 on fixtures; a golden for fusion on a hand-built case (rule box + pixel box overlapping → one finding, provenance both); html report passes axe (playwright) with 0 violations.
Out of scope: web app.
```

## M7a: web shell, New Audit, progress
```
Milestone M7a: web shell, New Audit and run progress. Branch m7a-web-shell. Read DESIGN_SPEC §1, §2 (New Audit, Run progress), PLAN.md §6.
Deliver: app shell (top bar, theme toggle, skip links, landmarks), `/` New Audit per spec (URL tab + Screenshots tab, validation, recent runs table), `/runs/[id]` progress state consuming GET /runs/{id}/events (SSE) with stepper, live region, skeleton canvas and cross-fade; API client from generated types (`pnpm gen:types`); TanStack Query provider; services/app endpoints POST /runs, /uploads, GET /runs/{id}, /events, assets.
Acceptance: e2e (Playwright): submit a fixture folder run → progress → lands on report route with the screenshot visible; `@axe-core/playwright` 0 violations on `/` and `/runs/[id]` (progress state); keyboard-only run of the New Audit form in the e2e test; vitest unit tests for URL normalisation.
Out of scope: report panes.
```

## M7b: Report screen
```
Milestone M7b: the Report screen. Branch m7b-report. Read DESIGN_SPEC §2 Report (layout, rail, canvas, right pane, table, states) and §3–§5.
Deliver: three-pane layout with ResizablePanel and responsive collapse; criteria rail; canvas (img + SVG overlay in react-zoom-pan-pinch with keyboard and button controls, roving tabindex boxes with aria-labels, dual-stroke severity styles, selection auto-fit, focus-pair ToggleGroup Focused/Unfocused/Diff, label toggle, minimap); right pane (evidence card with swatches and 2× crop, fix tabs with copy, status buttons, J/K); table view (TanStack virtualised, facets, grouping, URL state); empty/partial/error states; PATCH /findings/{id}.
Acceptance: `@axe-core/playwright` 0 violations (AA + AAA tags) on the report route for both fixtures; e2e keyboard test: Tab to canvas → arrow to third box → Enter → detail shows that finding → K → previous; URL state restored on reload; visual snapshot at 1440×900 committed; manual VoiceOver pass noted in NOTES.md.
Out of scope: coverage/compare/eval screens.
```

## M7c: Coverage, Compare, Evaluation screens
```
Milestone M7c: Coverage, Compare, Evaluation. Branch m7c-secondary-screens. Read DESIGN_SPEC §2 (those three) and PLAN.md §8.
Deliver: `/runs/[id]/coverage` grid + catalogue text from GET /catalogue; `/runs/[id]/compare` with synchronised canvases and diff list; `/eval` with POST /eval trigger, SSE progress, per-SC bars with CI whiskers + table alternative, strata tabs, McNemar/ΔP table, CSV/LaTeX export; Export menu in the report top bar (JSON/HTML/PDF/CSV with size).
Acceptance: axe 0 violations on all three routes; e2e renders /eval from a committed eval/fixtures/metrics.json; export files download and open.
```

## M8: full evaluation
```
Milestone M8: run the full evaluation. Branch m8-eval-run. Read PLAN.md §8, §9.
Deliver: `make eval` on $BENCHMARK_DIR for both conditions; eval/<date>/metrics.json, tables.md, tables.tex, failures.csv (with page_features), sensitivity.csv (IoU 0.1–0.7) and a matplotlib figure; a re-capture stability check script on 10 real pages (`auditor capture` live vs benchmark, report finding-level agreement); DECISIONS.md entries for any threshold/tie-break decisions; update NOTES.md with timings.
Acceptance: `make eval` twice yields identical metrics.json; tables.md contains per-SC P/R/F1 with CI for real, synthetic, combined × hybrid, rule_only; McNemar table marks degenerate SCs; ΔPrecision CI present.
```

## M9: developer-study build
```
Milestone M9: study build. Branch m9-study. Read PLAN.md §5 (study tables), DESIGN_SPEC §2 /study; read ../04_Data_Collection/Ethics_Application_Bundle_v1.docx task instructions and SUS (extract text with python-docx).
Deliver: study tables + endpoints; `/study` flow (code → consent check → counterbalanced AB/BA task list from study/assignments.csv → task page embedding the report for the task's page in the assigned condition → submit-fix form → SUS → thanks); server-side timing; rule-only condition parity check (same UI, axe findings only, not-covered cells honest); export of session data as CSV.
Acceptance: e2e completes a full AB session; timing rows written; rubric fields present; pilot notes template in NOTES.md.
```

## M10: detector
```
Milestone M10: detector and ablation. Branch m10-detector. Read PLAN.md §4.1, §4.4; install the `ml` extra.
Context: training runs on this Mac: Apple M5 Pro, 48 GB (recorded 2026-10-10; MPS; see PLAN §4.4 and ADR-009). Record macOS and torch versions in NOTES.md.
Deliver, in this order:
1. detector/classmap.yaml (WebUI labels → 6 classes, with a coverage test), prepare_webui.py (download biglab/webui-70k-elements, filter widths, eTLD+1 + perceptual-hash dedupe, exclude benchmark domains with a failing test if any leak; manifest with hashes; 8k train / 1k val).
2. **smoke_train.py**: 200 images, 1 epoch, device mps with PYTORCH_ENABLE_MPS_FALLBACK=1; print images/s and peak memory. Decision gate: if RF-DETR fails or runs < 1 img/s, switch train.py to the torchvision Faster R-CNN MobileNetV3-FPN fallback and record it in DECISIONS.md. Do not proceed to the full run without this gate.
3. train.py (RF-DETR Nano, res 560, batch 8, 20 epochs, 15k/1.5k images, EMA, seed, per-epoch checkpoints, resume; `--model small` flag for the second run; `caffeinate -i` wrapper script; logs config/manifest hashes/loss/per-class mAP to data/models/<run>/), export_onnx.py, infer.py (onnxruntime CPU), elements/detector.py (DetectorElementSource), `auditor eval --elements dom|detector` ablation on the real stratum, label-noise audit script (200 boxes).
Acceptance: smoke result and decision in NOTES.md; mAP report committed under eval/detector/; ablation table in eval/<date>/ablation.md; screenshot-only run (`auditor run --screenshots a.png`) produces 1.4.11 and 2.5.8 findings with tier needs-review where size/weight unknown.
```

## M11 (stretch): OCR + calibration
```
Milestone M11: screenshot-only text runs via rapidocr (extra `ocr`) for 1.4.3 with large_text=unknown; confidence calibration (reliability diagram, ECE) of module scores against synthetic truth; report both in eval/.
```
