# Prototype implementation plan, v1 (final, for Claude Code)

**Artefact:** ML-assisted accessibility auditor for web UI screenshots, aligned with WCAG 2.2.
**Owner:** L.W.S.D. Alwis. **Date:** 2026-10-10. **Supersedes:** `PLAN_v0.md` (kept for the record).
**How this was produced:** v0 was reviewed in parallel by six independent reviewers (architecture, ML/CV, product design, accessibility, examiner, Claude Code hand-off). Their findings are merged here; the individual reviews are in `reviews/`.

This plan is the contract. `CLAUDE.md` (repo rules), `MILESTONES.md` (task prompts), `DESIGN_SPEC.md` (UI), `CHECK_CATALOGUE.md` (RO1) and `DECISIONS.md` (ADRs) sit beside it.

---

## 0. The ten decisions that changed from v0

| # | v0 said | v1 says | Why |
|---|---|---|---|
| 1 | Playwright 1.62, axe-core 4.12 | **Playwright 1.63.0, Chromium 153, axe-core 4.13.0 copied byte-for-byte from `04_Data_Collection/vendor/`** | The benchmark and baseline were made with these; anything else fails the M2 "same numbers" test |
| 2 | Postgres + Redis + arq worker | **SQLite + one FastAPI process with an in-process job runner; Playwright in a subprocess** | Single laptop, single user; arq is maintenance-only; two fewer services to fail |
| 3 | Detector on the critical path | **DOM-first element source; detector only for screenshot-only mode and as the ablation** | Benchmark always has DOM; detector slippage no longer blocks modules, report or Chapter 5 |
| 4 | "Same SC and IoU ≥ 0.3" for all matching | **Page SCs match by IoU ≥ 0.3; focus SCs match by focus-stop index** | Ground truth stores focus criteria per stop, not as boxes |
| 5 | Thresholds in code | **`protocol.yaml` is the only place numbers live** (modules, fusion, harness, synthetic generator) | Prevents the fifth copy of 4.5 / 3.0 / 24 / 1.5 / 4(w+h) |
| 6 | 2,000 bootstrap resamples; McNemar only | **10,000 resamples; McNemar per unit; bootstrap CI on ΔPrecision for H1's non-inferiority clause; strata reported separately** | Thesis commitments |
| 7 | 11 detector classes incl. slider/overlay | **6 classes**; overlays from DOM (`fixed`/`sticky`); 2.5.7 is DOM-only | Those classes are not learnable from WebUI |
| 8 | WeasyPrint PDF; PaddleOCR | **Chromium `page.pdf()`; RapidOCR as an optional extra (stretch)** | Fewer system deps |
| 9 | Dashboard of cards, 8 screens, Storybook, cmdk, motion | **URL bar as front door, 4 core screens, cut Storybook/cmdk; motion only for 3 transitions** | Scope and taste; see DESIGN_SPEC |
| 10 | "Calibrated confidence" | **Three tiers (automated / needs-review / not-assessable) plus a raw score; calibration (reliability diagram) only if time allows** | An examiner will ask "calibrated against what?" |

---

## 1. What the artefact must do

Thesis commitments (Ch. 1, §3.4, §3.9):

1. **Capture.** Render a URL at desktop 1440×900 and mobile 390×844 (DSF 1) in Chromium; save full-page `screenshot.png`, `dom.html`, one `focus-NNN.png` / `focus-NNN-off.png` pair per keyboard focus stop, `meta.json`. Same layout as `capture_and_select.py` v2.4.0, so the benchmark is a valid input. Also accept an **offline capture folder** (replay mode) and **uploaded screenshots** (screenshot-only mode, reduced coverage).
2. **Rule channel.** axe-core 4.13, WCAG 2.2 ruleset, in the live or snapshot page. Covers 1.4.3 (`color-contrast`) and 2.5.8 (`target-size`) only. Port of `run_baseline.py`.
3. **Pixel channel.** An **element source** (DOM boxes when available, RF-DETR detector otherwise) plus **one module per criterion**: 1.4.3, 1.4.11, 2.4.7, 2.4.11, 2.4.12, 2.4.13, 2.5.7, 2.5.8. Measurements reproduce Protocol v1.1 (R1–R6, O1–O8).
4. **Fusion.** Match rule and pixel findings (same SC; IoU ≥ 0.3 or containment ≥ 0.5); one finding per element with provenance `rule | pixel | both`, tier and score.
5. **Coverage matrix.** Per run and per configuration: for each SC, which channel returned a verdict (`automated`, `needs-review`, `not-assessable`), and the count of SCs with a reliable verdict (RQ3).
6. **Developer report.** Findings on the screenshot with evidence, WCAG reference, fix guidance. Two **conditions**: `hybrid` and `rule-only` (same UI, same capture, axe findings only, honest "not covered" cells).
7. **Evaluation harness.** Score the frozen benchmark against `benchmark_ground_truth.json` (real) and `truth.json` (synthetic); produce Chapter 5 tables and the failure-analysis CSV.
8. **Check catalogue (RO1).** A written table: SC → decision procedure → detectability class (DOM / pixel / both / manual) → ACT rule cross-reference → tier. Delivered as `CHECK_CATALOGUE.md` and rendered in the app's Coverage screen.

Echelons (§3.4.3):

| Echelon | Delivers | Acceptance |
|---|---|---|
| **E1** | Capture port, rule channel, schema, replay mode, harness scoring rule-only | Rule-only numbers byte-equal to the committed baseline golden |
| **E2** | Element source (DOM), eight modules, synthetic oracle tests | Element-level recall ≥ 0.90 per SC on synthetic desktop captures, precision ≥ 0.90 on compliant controls |
| **E3** | Fusion, coverage, report, web UI, study build; detector + ablation | Hybrid vs rule-only Chapter 5 tables; app passes its own eight checks; study pilot run |

---

## 2. Architecture

```
apps/web (Next.js 16.3, TypeScript)
   │ HTTP + SSE
   ▼
services/app (FastAPI 0.141, uvicorn, SQLite via SQLAlchemy 2)
   ├── routers: runs, captures, findings, report, eval, study
   ├── jobs: in-process asyncio runner (one job at a time; queue table in SQLite)
   └── subprocess: `auditor run …` per job (Playwright lives there; memory is freed per run)
                       │
                       ▼
packages/auditor (pure Python library + Typer CLI; the thesis artefact)
   capture/  rules/  elements/  modules/  fusion/  report/  eval/  protocol.yaml  schema.py
   detector/ (optional extra `ml`; ONNX inference; training scripts)
                       │
                       ▼
data/runs/<run_id>/<viewport>/   (capture folder layout) + report.json + report.html
```

Principles: the library runs without the web app (`auditor run`, `auditor eval`); the API is a thin shell; everything is local-first and reproducible (`VERSIONS.json` per run, `uv.lock`, `pnpm-lock.yaml`, seeds).

Repo layout:
```
wcag-auditor/
  CLAUDE.md  PLAN.md (copy)  DECISIONS.md  FAILED_ATTEMPTS.md  NOTES.md  Makefile  .env.example
  packages/auditor/
    auditor/
      schema.py            Finding, Capture, Run, Coverage (Pydantic v2) — written in M0
      protocol.yaml        all thresholds and rule flags (Protocol v1.1)
      frames.py            CSS-px ⇄ PNG-px ⇄ document-px transforms (scroll, png_scale)
      capture/             driver.py (Playwright), focus.py (Tab stepping), snapshot.py (<base href>, script strip)
      rules/               axe.py, rulemap.py, vendor/axe.min.js (sha256 asserted = benchmark copy)
      elements/            base.py (ElementSource protocol), dom.py, detector.py, ocr.py (optional)
      modules/             sc_1_4_3.py … sc_2_5_8.py, context.py
      fusion/              match.py, coverage.py, tiers.py
      report/              build.py, template.html, guidance.yaml (per-SC fix content), pdf.py
      eval/                harness.py, units.py (ported from agreement.py), metrics.py, bootstrap.py, mcnemar.py, tables.py, failures.py
      detector/            classmap.yaml, prepare_webui.py, train.py, export_onnx.py, infer.py
      cli.py
    tests/  fixtures/ (3 synthetic + 2 real capture folders, small PNGs; golden outputs)
  services/app/            FastAPI app, models, alembic, jobs, tests
  apps/web/                Next.js app (shadcn on Base UI)
  eval/                    harness outputs by date (committed tables, not PNGs)
  data/                    runs, models (gitignored); BENCHMARK_DIR env points at ../04_Data_Collection/benchmark_captures (read-only)
```

---

## 3. Stack (pinned)

### Python (3.12, `uv`)
| Need | Package | Notes |
|---|---|---|
| API | `fastapi[standard]==0.141.*`, `uvicorn` | SSE via `sse-starlette` |
| DB | `sqlalchemy>=2.0`, `alembic`, SQLite (`aiosqlite`) | one file `data/app.db` |
| Schemas | `pydantic>=2` | `schema.py` is the single finding shape |
| Browser | `playwright==1.63.0` | `uv run playwright install chromium`; Docker image `mcr.microsoft.com/playwright/python:v1.63.0-noble` |
| Rules | vendored `axe.min.js` 4.13.0 | from `04_Data_Collection/vendor/` |
| Images | `pillow>=12`, `numpy`, `opencv-python-headless`, `scipy` | distance transform for ring thickness |
| Detector (extra `ml`) | `rfdetr` (Apache-2.0; Nano/Small only), `torch`, `albumentations`, `onnxruntime` | ONNX is the shipped inference path |
| OCR (extra `ocr`, stretch) | `rapidocr-onnxruntime` | screenshot-only text runs |
| Stats | `scipy`, `statsmodels`, `scikit-learn` | McNemar, κ cross-check |
| CLI | `typer`, `rich` | |
| Tooling | `ruff`, `mypy`, `pytest`, `pytest-playwright`, `pytest-cov` | |

### TypeScript (Node 22, `pnpm`)
| Need | Package | Notes |
|---|---|---|
| Framework | `next@16.3`, React 19, React Compiler on | App Router, Turbopack |
| UI | `shadcn` on **Base UI** (`-b base`), `tailwindcss@4`, `lucide-react`, `geist` | owned components in `components/ui` |
| Data | `@tanstack/react-query@5`, `@tanstack/react-table@8`, `@tanstack/react-virtual` | |
| Canvas | `<img>` + SVG overlay; `react-zoom-pan-pinch` with keyboard and button controls added | no drag-only interaction |
| Charts | shadcn `chart` (Recharts) with table alternative | |
| Forms | `react-hook-form`, `zod` | |
| Feedback | `sonner` (role=status, bottom-right) | |
| Types | `openapi-typescript` → `src/api/types.ts` (generated) | |
| Test | `vitest`, `@playwright/test`, `@axe-core/playwright` | "passes its own checks" gate |
| Lint | Biome | |

---

## 4. The pixel channel

### 4.1 Element source
```python
class ElementSource(Protocol):
    def elements(self, capture: Capture) -> list[Element]   # Element(kind, bbox_css, text?, style?, dom_ref?, is_native, is_disabled)
```
- `DomElementSource`: Playwright over the snapshot DOM (`<base href>`, scripts stripped; port of `run_baseline.snapshot_html`): interactive elements, text runs (per line box via `Range.getClientRects`), computed `color`, `font-size`, `font-weight`, `position: fixed|sticky` regions, `role=slider`, `input[type=range]`, disabled state.
- `DetectorElementSource`: RF-DETR ONNX over the screenshot; 6 classes `text, link, button, input, choice (checkbox/radio/select), image_icon`. Used when no DOM, and for the ablation.
- `MergedElementSource` (optional, E3): DOM boxes plus detector boxes with no DOM match (untagged div-buttons).

### 4.2 Coordinate frames (`frames.py`)
- Document CSS px is the canonical frame for every `Finding.bbox`.
- Full-page `screenshot.png`: 1 px = 1 CSS px (DSF 1).
- Focus PNGs: viewport images; position = `rect × png_scale`; document position = `rect + scroll`.
- Non-responsive mobile pages have `png_scale < 1` (e.g. 0.398); every area is divided by `png_scale²`, every length by `png_scale`.
- Unit test: round-trip on a non-responsive mobile fixture against `sa_tools.crop_for`.

### 4.3 Modules (`run(ctx) -> list[Finding]`, pure functions; thresholds from `protocol.yaml`)

| SC | Unit | Method | Protocol rules |
|---|---|---|---|
| 1.4.3 | text run (line box) | DOM path: computed colour vs sampled background behind the glyph mask (morphological opening removes glyphs); pixel path: two dominant colours after discarding boundary pixels; non-uniform backgrounds: worst 24-px sliding window; large text from DOM (`≥24px`, or `≥18.66px` and weight `≥700`); from pixels `large=unknown` → 4.5:1 with tier `needs-review` | O8; exceptions: logotype (img/svg), disabled, placeholder, incidental |
| 1.4.11 | control | boundary ring (1 px edge) vs inside and outside; best of border/fill; skip when a visible text label identifies the control; state contrast for checked/selected when DOM says so; exempt unstyled native controls and disabled | O2, O6 |
| 2.4.7 | focus stop | changed-pixel mask (`Δ > 24` per channel sum) inside rect + pad; max state contrast ≥ **1.5:1** → visible; flag "unsettled" if > 5 % of pixels changed outside the pad (carousel moved) | R1, R2 |
| 2.4.11 / 2.4.12 | focus stop | fraction of the focused rect covered by DOM `fixed/sticky` boxes with alpha 1 (hit-test at 25 sample points); entire → both, partial → 2.4.12; pixel fallback: identical on/off pixels inside rect = covered | R6; open modals and dismissible content exempt |
| 2.4.13 | focus stop | added-indicator mask (ignore removed pixels); ring detection: connectivity around the rect; thickness via distance transform; **R5**: solid ring ≥ 2 CSS px with ≥ 3:1 change on all sides → meets; else **O4**: changed pixels at ≥ 3:1 must reach 4(w+h) | R4, R5, O1, O4; unstyled default ring = meets |
| 2.5.7 | drag widget | DOM-only: `role=slider` / `input[type=range]` (native → pass) / drag libraries; custom widget with no visible single-pointer alternative (buttons, number input, click-on-track) → fail; no DOM → `not-assessable` | O7 (critical) |
| 2.5.8 | target | DOM `getBoundingClientRect` in CSS px; `< 24` in either dimension → check exceptions: inline (inside a prose line box), spacing (24-px circle intersects **no** other target), equivalent, user-agent; evidence lists which exception was tested | O3 |

Every finding carries `evidence` (measured value, threshold, swatches/crops, rule ids) and a `tier`: `automated` (measurement decisive), `needs-review` (exception or unknown-size cases), `not-assessable` (no input for this SC).

### 4.4 Detector (E3, `ml` extra)
- Data: `biglab/webui-70k-elements`, desktop and mobile widths, 6 classes via `classmap.yaml`; ~15k train / 1.5k val; **held out by eTLD+1** and perceptual hash; benchmark domains and subdomains excluded; a test fails if any benchmark eTLD+1 appears in the training manifest.
- **Compute: the researcher's own Mac (Apple silicon, decided 2026-10-10; ADR-009).** No Colab, no cloud GPU. Consequences for the recipe:
  - Device `mps` with `PYTORCH_ENABLE_MPS_FALLBACK=1`; before anything else, M10 runs a **10-minute smoke training** on 200 images to confirm RF-DETR trains on MPS at all (a bicubic op is known to fall back to CPU). If throughput is below 1 image/s, switch to the fallback detector below.
  - **Hardware (recorded 2026-10-10): Apple M5 Pro, 48 GB unified memory.** This is the top tier, so the full recipe applies: RF-DETR **Nano first** (resolution 560, batch 8 effective (micro-batch 4 with gradient accumulation 2, ADR-031), 20 epochs, **15k train / 1.5k val**, EMA on), expected 5–10 h overnight; then, if Nano's mAP meets the target, a second run with RF-DETR **Small** at the same settings (roughly 2× the time) for the thesis headline. Mixed precision off (MPS fp16 is unreliable). Run with `caffeinate -i`, checkpoint every epoch, resume on interruption.
  - Memory budget: 48 GB shared with the OS; keep workers at 4, close browsers and the capture tooling during training, and watch Activity Monitor's memory pressure on the first epoch.
  - **Fallback detector (if MPS training fails or is too slow):** `torchvision` Faster R-CNN (MobileNetV3-FPN) or `fasterrcnn_resnet50_fpn_v2`, which train reliably on MPS; same class map, same data pipeline, same ONNX export path. The thesis reports whichever model was trained; both are permissively licensed.
  - Inference stays ONNX on CPU (`onnxruntime`), so the shipped app does not depend on MPS.
- Target: mAP@0.5 ≥ 0.6 on non-text classes; report per-class mAP, loss curves, label-noise audit (n = 200 hand-checked boxes).
- Export ONNX opset 17, batch 1; inference via `onnxruntime` CPU.
- Ablation (Ch. 4/5): module recall with DOM boxes vs detector boxes on the real stratum.

---

## 5. Data model (SQLite)

- `runs(id, created_at, source_kind{url|upload|folder}, source, viewports, condition{hybrid|rule_only}, status, stage_status json, versions json, protocol_sha, error)`
- `captures(id, run_id, viewport, path, meta json, page_features json)`  — `page_features`: background complexity (edge density), element density, focus-stop count, has_sticky, is_non_responsive (for H4 and the failure taxonomy)
- `findings(id, capture_id, sc, bbox json, focus_index null, severity, tier, score, provenance, evidence json, guidance_key, status{open|fixed|ignored})`
- `coverage(capture_id, sc, rule_verdict, pixel_verdict, hybrid_verdict)`
- `eval_runs(id, created_at, benchmark_sha, truth_sha, protocol_sha, config json, metrics json)`
- `study_sessions(id, participant_code, order{AB|BA}, consent_at)`; `study_tasks(id, session_id, task_id, condition, opened_at, submitted_at, success, notes)`; `sus_responses(session_id, item, score)`

---

## 6. API

```
POST /runs                        {url | upload_id | folder, viewports[], condition} → {run_id}
POST /uploads                     multipart screenshots (+ optional focus pairs) → {upload_id}
GET  /runs/{id}                   summary, stage_status, coverage, versions
GET  /runs/{id}/events            SSE: queued | capture:<vp> | rules | elements | module:<sc> | fusion | report | done | failed:<stage>
GET  /runs/{id}/findings          ?vp=&sc=&severity=&provenance=&tier=
PATCH /findings/{id}              {status}
GET  /runs/{id}/assets/{vp}/screenshot | /focus/{n}/{on|off} | /crop/{finding_id}
GET  /runs/{id}/report.{json|html|pdf}
GET  /catalogue                   check catalogue (from CHECK_CATALOGUE.md / protocol.yaml)
POST /eval  GET /eval/{id}        harness run (CLI underneath)
POST /study/sessions …            study logging (M9)
```
TypeScript types are generated from the OpenAPI document; never hand-written.

---

## 7. UI/UX

Full spec in `DESIGN_SPEC.md`. Summary of what is fixed:

- **Front door is the URL bar** (`/`): URL field, viewport toggles, condition under "Advanced", drag-and-drop screenshots tab; recent runs as a dense table below. No dashboard cards.
- **Report** (`/runs/[id]`): three panes `280px | 1fr | 380px`, resizable, collapsing to a Sheet under 1280 and tabs under 1024. Left: criteria rail with severity count triplets and provenance glyphs. Centre: screenshot canvas with SVG boxes (dual stroke: severity colour over a white/black halo, severity glyph in the corner), hover/selection, auto-fit to selection, focus-pair control as a toggle group (Focused / Unfocused / Diff), zoom buttons and keyboard (`+ − 0`, arrows). Right: finding detail with evidence block (measured vs required, sampled swatches, 2× crop), WCAG link, fix snippet (HTML/CSS tabs, copy), status buttons, J/K navigation. Table view (TanStack, virtualised) is the canonical screen-reader view and is two-way linked with the canvas.
- **Coverage** (`/runs/[id]/coverage`): 8 SC × channel grid, tier legend, catalogue text.
- **Compare** (`/runs/[id]/compare`): hybrid vs rule-only for the same capture.
- **Evaluation** (`/eval`): triggers the harness, shows per-SC P/R/F1 with CI, McNemar/ΔP, strata tabs, exports CSV/LaTeX. Charts have table alternatives.
- **Study mode** (`/study/...`): participant code, counterbalanced task sequence, timer, SUS form (M9).
- Chrome is monochrome (zinc); the only saturated things are the screenshot, severity marks and the focus/selection accent (blue). Light and dark themes with separate severity tokens, all verified for 4.5:1 / 3:1. Motion: 120/200/240 ms, reduced-motion respected.
- **The app must pass its own eight checks** (including the AAA ones): every focus indicator is a solid ≥ 2 px ring at ≥ 3:1; nothing sticky ever covers a focused element; no drag-only control; all targets ≥ 24 px. Gate: `@axe-core/playwright` zero violations on every route plus one manual VoiceOver pass of the report screen.

---

## 8. Evaluation harness (Chapter 5)

`auditor eval --benchmark $BENCHMARK_DIR --truth $TRUTH_PATH --synthetic-truth from-folders --conditions hybrid,rule_only --out eval/<date>/ --seed 20261004 --bootstrap 10000`

- **Units** (ported from `annotation/agreement.py`): page SCs = (page × viewport, SC) with box matching IoU ≥ 0.3; focus SCs = (focus stop, SC) by index; `excluded_focus_stops` skipped; R6 "not-assessable" fields skipped for 2.4.7/2.4.13.
- **Synthetic pages** scored only on their seeded SC (2.4.11 pages also on 2.4.12); desktop captures only (truth exists only there). Compliant synthetic pages count as negatives.
- **Metrics** per SC, per stratum (real / synthetic) and combined, per condition: TP/FP/FN, precision, recall, F1; bootstrap over pages (10,000, seeded) for 95 % CIs; **McNemar** on paired per-unit outcomes hybrid vs rule-only (state when degenerate: baseline all-miss on 6 SCs); **bootstrap CI on ΔPrecision** (H1 non-inferiority, ΔP ≥ −0.05); Benjamini–Hochberg over the eight comparisons; coverage count per configuration (RQ3).
- **IoU sensitivity sweep** 0.1–0.7 (figure for Ch. 4).
- **Outputs**: `metrics.json` (with benchmark/truth/protocol SHAs, versions, seed), `tables.md`, `tables.tex`, `failures.csv` (every FP/FN with `page_features`), `sensitivity.csv`.
- **Reproducibility**: `make eval` must regenerate identical `metrics.json`.

---

## 9. Chapter 4 evidence the implementation must produce

`DECISIONS.md` (ADRs with dates and evidence), `FAILED_ATTEMPTS.md`, per-echelon acceptance logs, training run records (config, seed, manifest hashes, per-class mAP, loss curves, label-noise audit), IoU sweep figure, `VERSIONS.json` per run, protocol-consistency test, re-capture stability check on a 10-page sample, page-feature extraction, failure taxonomy table, study build artefacts (counterbalance file, timing schema, rubric, pilot notes), viva demo script with three unseen pages.

---

## 10. Milestones (each sized for one Claude Code session; prompts in `MILESTONES.md`)

| # | Goal | Done when |
|---|---|---|
| M0 | Scaffold monorepo, CLAUDE.md, `schema.py`, `protocol.yaml`, fixtures, Makefile, CI | `make check` green; `make smoke` prints a report for a fixture |
| M1 | `auditor.capture` port + `auditor capture <url>` + replay mode | `validate_captures.py` passes on output; meta keys ⊇ v2.4.0 |
| M2 | `auditor.rules` + harness (units, metrics, bootstrap) scoring rule-only | byte-equal to `fixtures/baseline_golden`; harness unit test with toy truth |
| M3 | `frames.py` + `DomElementSource` + page features | round-trip test on non-responsive fixture; element dump golden |
| M4 | Modules 1.4.3, 1.4.11, 2.5.8 | synthetic recall ≥ 0.90 each; no literal thresholds in `modules/` |
| M5 | Modules 2.4.7, 2.4.11/12, 2.4.13, 2.5.7 | synthetic recall ≥ 0.90 each; R5/O4 fixture tests |
| M6 | Fusion, tiers, coverage, report schema/HTML/PDF, guidance.yaml | hybrid and rule-only reports for 5 real pages reviewed; coverage counts |
| M7a | Web: shell, New Audit, run progress (SSE), API wiring | e2e: submit fixture folder → report page loads |
| M7b | Web: Report screen (rail, canvas, detail, table) | a11y gate passes; keyboard model works; snapshot test |
| M7c | Web: Coverage, Compare, Evaluation, exports | tables render from `metrics.json` |
| M8 | Full harness run, Chapter 5 tables, IoU sweep, failures.csv | `make eval` reproducible |
| M9 | Study build: sessions, counterbalanced tasks, timing, SUS, rule-only condition parity | pilot with 2 people logged |
| M10 | Detector: data prep, train, ONNX, `DetectorElementSource`, ablation | mAP report; ablation table |
| M11 (stretch) | Screenshot-only mode with OCR; confidence calibration | |

Drop order if time runs out: M11 → calibration → Compare screen → PDF export → M10 (keep DOM-only, state the limitation) → mobile viewport in the pixel channel.

---

## 11. Open items for the researcher (not blocking M0–M6)

1. ~~GPU for M10~~ Decided: train on the local Mac (ADR-009). Confirm the Mac's chip and RAM in `NOTES.md` before M10.
2. Developer-study task pages: four pages outside the benchmark, chosen with the supervisor; ethics approval gates M9.
3. Supervisor sign-off on the artefact mutability note (RF-DETR instead of YOLOv8): `DECISIONS.md` ADR-001.
