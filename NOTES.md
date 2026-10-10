# Implementation notes

Running log for Chapter 4. Claude Code appends to this file; the researcher adds decisions and observations.

## Hardware

- 2026-10-10: development and training machine is a MacBook Pro, **Apple M5 Pro, 48 GB** unified memory. Record macOS and PyTorch versions at the start of M10.

## Ambiguities resolved with the Protocol v1.1 reading

(none yet)

## Milestone logs

(none yet)

## M0 scaffold (2026-10-10, branch m0-scaffold)

- axe.min.js copied from `../04_Data_Collection/vendor/axe.min.js`, sha256 `c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1`. `VERSIONS.json` records it for every run.
- Resolved versions: Next.js 16.4.0, React 19.3.0, Tailwind 4.3.3, Biome 2.4.2, FastAPI 0.141, SQLAlchemy 2.1.4, Playwright 1.63.0 (Python and `@playwright/test`).
- `fixtures/README.md` documents the layout; the benchmark's meta.json says generator 2.2.0, the benchmark README 2.3.0, CLAUDE.md 2.4.0. M1 must reconcile this before claiming "v2.4.0 key set".
- `apps/web` shadcn preset is `nova` with `-b base` (Base UI). The generated `src/lib/utils.ts` re-exported `cn` from an unvetted `cn` npm package; replaced with the standard clsx + tailwind-merge implementation.
- `make check` runs ruff, mypy, pytest, biome and vitest. The axe gate is `pnpm -C apps/web e2e` (needs `pnpm exec playwright install chromium`); run in CI after `build`.
- Playwright config refuses to reuse a server already on the port: a stale dev server on :3000 from another project made the first e2e run audit the wrong app. Use `WEB_PORT=<free port> pnpm -C apps/web e2e` if 3000 is busy.

### Deviations from PLAN
- SQLAlchemy uses the synchronous SQLite driver (no `aiosqlite`); the in-process runner is asyncio and DB calls are short. Revisit if SSE load needs it.
- Real fixtures have no `truth.json` in the benchmark (truth lives in `benchmark_ground_truth.json`); M0 extracted each item into the fixture's `truth.json`.
- The 976 KB mobile screenshot is committed uncompressed, against CLAUDE.md's "no PNG > 200 KB", because the M0 prompt says to keep that fixture's originals.
- `.gitignore` carries `autopilot.sh` and `.autopilot-logs/` lines added outside this session; left uncommitted.

## M1 capture (2026-10-10, branch m1-capture)

- `auditor/capture/`: `driver.py` (PlaywrightBrowser, `capture_url`), `focus.py` (`step_focus` + sentinel/info JS), `snapshot.py`, `proxy_signals.js` (verbatim copy of `../04_Data_Collection/webui_proxy_signals.js`, needed because `validate_captures.py` requires `proxy_findings.json`).
- `auditor capture <url> --out <dir> --viewports desktop,mobile` writes the benchmark folder layout plus `VERSIONS.json`; `auditor run --folder` replay already worked and is covered by a browser test.
- The 7 benchmark-only meta keys are emitted as `null` so new captures contain the full benchmark key union; the test checks the whole union.
- `fixtures/sites/static.html` created (the milestone referenced it but it did not exist).
- Defaults follow the benchmark tool: `--max-focus-steps` is 15 (the labelled `focus_judgments` cover at most 15 stops); folder timestamps stay `%Y%m%dT%H%M%SZ` (a same-second repeat raises `FileExistsError`).
- `meta.protocol_version` is `1.0` because it records the capture tool's protocol (as in the benchmark), not the labelling protocol (1.1).
- `capture/proxy_signals.js` is a frozen byte-identical port of `webui_proxy_signals.js` and carries its own 4.5/3.0/24/2 literals. It only feeds `proxy_findings.json`, which is never read as a measurement, so it is outside the no-literals test.
- No resume/skip logic for existing captures (the benchmark tool has it, the CLI does not). `sector` is the URL host slug and `page_id` is 1.
- `auditor capture` keeps successful viewports when another fails, prints the failures and exits 1.
- Browser tests are excluded from `make check`; run `make test-browser` (sets `REQUIRE_BENCHMARK=1`, so missing benchmark tooling fails instead of skipping).
- Not covered yet (reviewer note): iframe, zero-stop and non-responsive-mobile browser fixtures; M3 adds the non-responsive case via the real fixture.

## M3 frames + DOM element source (2026-10-10, branch m3-elements)

- `auditor/frames.py` (`Frame`: css/png/document transforms, `area_to_css` divides by png_scale², `crop_box` equals `sa_tools.crop_for` within 1 px on every stop of the non-responsive mobile fixture). Focus rects are viewport-relative CSS px (`getBoundingClientRect`); document position = rect + scroll.
- `elements/` (`Element`, `ElementSource`, `DomElementSource` + `extract.js`) and `features.py` (edge density, element density, focus-stop count, has_sticky, is_non_responsive). Goldens: `fixtures/golden/elements/<folder>.json`, regenerated with `make goldens`.
- `edge_gradient_threshold: 16` is a new entry in `protocol.yaml` `heuristics`. It only feeds the descriptive `edge_density` page feature (H4 stratification), never a verdict.
- **Limitation (important for Chapter 4/5):** `DomElementSource` re-renders the saved `dom.html` offline (network blocked, so goldens are reproducible). Synthetic pages are self-contained and match the capture exactly (2.5.8 buttons IoU 1.0 against truth and focus rects; 2.4.13 button equals the focus rect). **Real pages do not**: external CSS is not available offline, so 0 of 15 focus rects match a DOM box on both real fixtures, and allowing network (live `<base href>`) did not help either. The baseline `run_baseline.py` snapshot has the same property, so rule-only numbers stay comparable, but DOM-derived boxes for the real stratum are unreliable. Options for the planner: capture computed geometry at capture time (new capture folders only), or rely on the pixel/detector path for the real stratum. Not decided here.
- **Granularity mismatch for M4:** synthetic 1.4.3 truth is the whole text block (640x60) while the DOM text line box is 437x16, IoU 0.18, below the 0.3 match threshold. M4 needs a containment or block-level rule; flag in "Needs planning".

### Needs planning
- Real-stratum element source (see limitation above). **ANSWERED 2026-10-10 by the planner: ADR-012** (focus SCs use capture-time focus rects; real-page page-SCs use a PixelElementSource = OCR text lines + detector; new captures save `elements.json`; new milestones M1b and M10a; M10 moved before M6; see PROGRESS.md order).
- 1.4.3 synthetic truth boxes are blocks, DOM text runs are line boxes (Protocol R3 says one box per text run). **ANSWERED: ADR-013** (match on IoU or containment ≥ 0.5; multiple findings in one truth box = one TP + merged duplicates).
- `extract.js` limitations (reviewer notes, accepted for M3): fixed/sticky `alpha` is the element's own background alpha times its own opacity (ancestor opacity, gradients, backdrop-filter, non-rgb colour syntaxes are not modelled); regions are not clipped to the viewport; text hidden by `opacity:0`, clipping or off-screen indent still yields boxes; `unstyled_native` is absent for `<a>`. Goldens are compared with a 1 px tolerance but were generated on macOS (Apple silicon, Chromium 153); regenerate inside the pinned Docker image before relying on them in Linux CI. Password input values are never recorded.

## M1b capture-time geometry (2026-10-10, branch m1b-capture-geometry)

State before M1b: M0, M1, M3 merged; M2 blocked (GT seal); order per ADR-012/013.
- `auditor capture` runs `extract.js` on the live page after settle and before the screenshot (scroll 0, document CSS px) and writes `elements.json` (`geometry_source: capture`, `captured_at`, `extract_sha256`, `viewport`, `doc_size`, `elements`). If extraction throws, the capture still succeeds without `elements.json` and `meta.geometry_error` records why (the folder then reports `unavailable`).
- `DomElementSource.geometry_source(capture)`: `capture` if `elements.json` exists (whatever the origin), `rerender` only for `origin == "synth"`, else `unavailable` (`GeometryUnavailable`; the benchmark real folders). `force_rerender=True` exists for controls. `allow_network` was removed.
- Evidence the stored geometry matters: on `fixtures/sites/static.html` (external `static.css`) all 5 focus rects match their own element (same selector, IoU ≥ 0.9) from `elements.json`, while a forced offline re-render matches at most 1 and loses the stylesheet colours.
- Goldens regenerated (`make goldens`) because their schema changed: synthetic goldens gain `"geometry_source": "rerender"` only; the two real goldens now hold `geometry_source: unavailable`, `elements: null` (about 3,500 lines removed) and null element features. Per-kind element counts for the real fixtures are no longer pinned (they were measured offline and are not trustworthy).
- Open: `screenshot(full_page=True)` can lay out `vh`/sticky elements differently from the geometry measured at viewport size; `doc_size` is recorded so a later check can compare it with the PNG height.

## M2 rule channel + evaluation harness (2026-10-10, branch m2-rules-eval)

State before M2: M0, M1, M3, M1b merged and pushed; ground truth sealed (`SEAL_LOG.md`, sha256 b859a6de…e20); M4 started on `m4-static-modules` (WIP, paused: M2 precedes it).
- `rules/axe.py` (`AxeRunner`: axe 4.13 over the saved DOM, snapshot mode as the baseline), `rules/rulemap.py` (rule -> SC, raw -> schema findings), `auditor run --condition rule_only` writes `rule_findings.json` (baseline shape) and a schema-valid `report.json` with coverage (rule verdict on 1.4.3 and 2.5.8 only).
- **Acceptance:** `rule_findings.json` is byte-equal to `fixtures/baseline_golden/*` for all 5 fixtures (browser test; real fixtures load their live CSS as the baseline did). Extra check: 40 of 40 random synthetic captures (desktop and mobile) byte-equal to the baseline run, so replaying synthetic pages from the saved DOM equals the baseline's live-URL runs.
- `eval/`: `units.py` (truth loading, stop truth ported from `agreement.py`), `match.py` (ADR-013), `metrics.py`, `bootstrap.py`, `mcnemar.py` (statsmodels, degenerate message), `tables.py` (md + tex), `failures.py`, `harness.py`; CLI `auditor eval`. Outputs per run: `metrics.json`, `VERSIONS.json`, `tables.md`, `tables.tex`, `failures.csv` (`page_features` is one JSON cell), `sensitivity.csv` (IoU 0.1-0.7, IoU-only and IoU-or-containment; the Chapter 4 figure should plot both).
- **Rule-only numbers on the full benchmark** (violations only, ADR-013 matching, 250 scored items: 100 real + 150 synthetic desktop; baseline run 20261010T064722Z_snapshot): real 1.4.3 P 0.724 R 0.473 (TP 653, FP 249, FN 728, 88 duplicates); real 2.5.8 P 0.145 R 0.676 (TP 23, FP 136, FN 11); real 1.4.11, 2.4.7, 2.4.11, 2.4.12, 2.4.13 and 2.5.7 recall 0 (axe has no rule: FN 96, 126, 11, 15, 373, 0 positives). Synthetic: 1.4.3 P 1.000 R 0.467 (7/15); 2.5.8 P 1.000 R 1.000 (52/52); all other seeded SCs recall 0. 862 needs-review nodes excluded. `make eval` twice gives byte-identical `metrics.json` (sha256 9ee96346…c3dc0a).
- **Deviations / limits:** the harness default `--conditions` is `rule_only`; `make eval` now runs `rule_only,pixel,hybrid` (`CONDITIONS` variable). Hybrid was added in M6 (see the M6 section); at M2 time hybrid-vs-rule-only McNemar, ΔPrecision and BH were only unit-tested on constructed data. Greedy ordering inside `match_boxes` no longer matters (multi-credit). Per-capture axe failures are recorded in `items_failed` and the item is left out of scoring. Boxless axe nodes and zero-size boxes are dropped and counted (`rule_findings_dropped`; none occurred on the benchmark). Desktop and mobile captures of one site are treated as separate bootstrap clusters. The M4 branch holds paused work.
- Needs planning: tier policy for the hybrid condition (ADR-014); whether ΔPrecision for SCs where rule-only makes no predictions should be reported as "not estimable" in the tables.

## M4 static modules 1.4.3, 1.4.11, 2.5.8 (2026-10-10, branch m4-static-modules)

State before M4: M0, M1, M1b, M2, M3 merged and pushed; M4 resumed after M2 (it had been paused as WIP).
- `modules/`: `color.py` (luminance/ratio equal to `sa_tools.ratio` on the 7 vectors in `tests/vectors.json`), `context.py` (`ModuleContext`: capture, elements, full-page pixels, protocol), `sc_1_4_3.py`, `sc_1_4_11.py`, `sc_2_5_8.py`, registry `MODULES`. Modules are pure; no threshold literals (the guard test passes); ring geometry lives in `protocol.yaml` `heuristics`.
- 1.4.3: foreground from the computed colour (alpha and effective opacity blended), background from pixels behind the glyphs, worst 24-px window (`contrast_window_px`); with no DOM style the foreground comes from pixels and the finding is `needs-review`. `extract.js` now records effective opacity and `in_svg`.
- Eval: new condition `pixel` (modules only, no fusion) in `auditor eval --conditions pixel`; same tier policy as the rule channel (ADR-014); captures without geometry (the benchmark's real pages, ADR-012) yield no predictions and are counted in `metrics.meta.pixel_captures_without_geometry`.
- **Acceptance (desktop synthetic corpus, 150 captures, `BENCHMARK_DIR`):** 1.4.3 TP 15/15 (3 merged duplicates), FP 0; 1.4.11 TP 20/20, FP 0; 2.5.8 TP 52/52, FP 0. Pinned by `test_m4_corpus_acceptance.py` (browser-marked; run it with `REQUIRE_BENCHMARK=1 make test-browser`; it fails rather than skips when the benchmark is missing). On `fixtures/synth` (1 page per SC): 1.4.3 1/1, 1.4.11 2/2, 2.5.8 4/4. Deviation from the prompt: the committed fixtures hold one page per SC, so the 0.90 recall/precision floor is measured on the full corpus, not on `fixtures/synth` alone.
- **Pixel-only 1.4.3 path** (DOM style stripped, simulating the future OCR source): recall 15/15 but 4 FP on the compliant controls (precision 0.79), all tier `needs-review`; the default automated-only policy therefore excludes them. M10a should treat this as the baseline for OCR-sourced boxes.
- New fixture `fixtures/synth/sc1-4-11/…026…` (+ baseline golden and element golden) so 1.4.11 is exercised without the benchmark directory; fixture count is now 6.
- Limits: `extract.js` records only the element's own box; text clipped by `overflow` or off-screen still produces text boxes; 1.4.11 state contrast and non-interactive graphics are not measured (ADR-016).

## M5 focus and drag modules 2.4.7, 2.4.11, 2.4.12, 2.4.13, 2.5.7 (2026-10-10, branch m5-focus-modules)

State before M5: M0-M4 and M1b merged and pushed; PROGRESS order per ADR-012/013.
- `modules/focus_common.py` (stop diff: crop around the rect with `focus_pad_px`, changed and added masks, per-pixel state contrast, unsettled flag, cached per stop on the context; `coverage_fraction`), `sc_2_4_7.py`, `sc_2_4_11_12.py` (`run_min`, `run_enh`), `sc_2_4_13.py`, `sc_2_5_7.py`. `ModuleContext` now carries the focus image pairs (`load_focus`, `has_geometry`). `extract.js` records `alternatives` for sliders (nearest ancestors), effective opacity, `contains_refs` for fixed/sticky regions. Rulings and limits: ADR-017.
- **Acceptance (desktop synthetic corpus, 150 captures):** 1.4.3 15/15, 1.4.11 20/20, 2.4.7 7/7, 2.4.11 15/15, 2.4.12 30/30, 2.4.13 8/8, 2.5.7 5/5, 2.5.8 52/52, all with 0 FP (pinned exactly by `test_pixel_corpus_acceptance.py`; run `REQUIRE_BENCHMARK=1 make test-browser`). Fixture level (no browser): `test_modules_on_fixtures.py` scores the committed fixtures (one page per SC plus the R5 control `2.4.13_092` and the default-ring control `2.4.7_047`) against `truth.json` with the cached element goldens: every SC 1.0/1.0. R5 fixture (2 px solid ring at 3.03:1, strong area 1026 < 4(w+h) = 1072) meets; O4 fixture (2.9:1) fails with 0 strong area. The non-responsive mobile fixture (`png_scale` 0.398) has its areas computed in CSS px (test).
- **Real stratum, pixel condition, sealed ground truth (measurement only, nothing was tuned on it):** 2.4.7 P 0.683 R 0.667 (TP 84, FP 39, FN 42); 2.4.13 with the default-ring exemption P 0.747 R 0.397 (recall CI [0.28, 0.52]), without it P 0.715 R 0.879 (CI [0.81, 0.94]). The 1.4.3, 1.4.11, 2.4.11, 2.4.12 and 2.5.8 real-stratum cells are 0 because the benchmark's real pages have no element geometry (ADR-012) and the pixel fallback is `needs-review` (136 findings excluded by the default policy). Real-stratum errors are spread evenly across desktop, responsive mobile and non-responsive mobile captures, so there is no scale-specific fault.
- **Needs planning:** (1) the default-ring conflict (ADR-017): CHECK_CATALOGUE/PLAN say exempt, the sealed labels mostly do not; (2) a primary/secondary control signal for 2.4.7 and 2.5.8 critical severities; (3) sticky-region tracking after scrolling for 2.4.11/12.
- `AUDITOR_PROTOCOL=<file>` points the harness at an alternate protocol file for sweeps; the SHA in `metrics.json` follows it.

## M10a OCR text source (2026-10-10, branch m10a-ocr)

State before M10a: M0-M5 and M1b merged and pushed. ADR-012: the benchmark's real pages have no element geometry, so their text boxes must come from pixels.
- `rapidocr-onnxruntime` is now a core dependency (ONNX CPU, no torch). `elements/pixel.py` `PixelElementSource`: full-page screenshot cut into strips of at most `ocr_tile_height_px` (2000) rows with `ocr_tile_overlap_px` (64) shared rows, RapidOCR detection plus recognition per strip (RapidOCR downsizes large inputs internally, so an untiled 4083 px page would lose small text), polygon -> axis-aligned box -> document CSS px through `frames.py`, duplicates from overlapping strips merged (IoU or containment from `protocol.yaml`, the larger/uncut box kept). Elements are `text` lines with the recognised string, the OCR score and `line_height_px`; no colour, size or weight.
- `elements/select.py`: `elements.json` present -> DOM; `origin == synth` -> DOM re-render; otherwise pixel. `eval` pixel condition uses it and records `pixel_element_sources` (`{dom: 150, pixel: 100}` on the full benchmark). `iou`/`containment` moved to `auditor/geometry.py`.
- 1.4.3 with OCR lines: the foreground and background come from pixels, `large_text` is unknown so the finding is `needs-review` at 4.5:1, unless the line height is at least `ocr_large_line_height_px` (32 CSS px, an implementation parameter) of glyph ink, which counts as large text (3:1) and `automated`. The ink height is measured from the pixels inside the OCR box (rows whose pixels differ from the box's most common colour): RapidOCR's detection boxes are padded (`unclip_ratio` 1.6), so their own height would call roughly 20 px text large and hide real 1.4.3 failures. The box height is kept as `box_height_px`.
- **Acceptance.** Synthetic 1.4.3 desktop corpus: 15/15 truth blocks contain an OCR line (containment >= 0.5; floor 90 %), the pinned corpus test needs the benchmark (`REQUIRE_BENCHMARK=1`). Runtime: about 0.6-0.8 s per real page including a 4083 px page (limit 20 s); a full 250-item benchmark evaluation takes about 2.5 minutes. Real fixtures (measurement, no threshold): `real_com_003_desktop` 6 of 6 truth 1.4.3 boxes get an OCR box and 6 TP / 1 FP / 0 FN with needs-review findings included; `real_com_011_mobile` 4 of 4, 4 TP / 0 FP / 0 FN.
- **Real stratum, pixel condition, sealed truth (measurement only):** 1.4.3 with the default automated-only policy P 0.405 R 0.011 (TP 15; almost every OCR-sourced finding is needs-review, 1,747 excluded); with `--include-needs-review` P 0.780 R 0.816 (TP 1127, FP 318, FN 254, 210 merged duplicates; recall CI [0.73, 0.89]). So the OCR source locates the text well; the tier policy, not the geometry, is what hides these findings. Chapter 5 should report both.
- Needs planning: whether needs-review findings should count toward the hybrid condition's 1.4.3 numbers (ADR-014 says automated only by default, which makes real-stratum 1.4.3 near zero); whether a heuristic for large text from OCR line height beyond the 32 px rule is wanted.
- Limits: lines taller than the 64 px strip overlap (large headings) can be cut by a seam in both strips and come out as fragments; dedupe compares only boxes touching a seam band so nested text elsewhere is never merged; the engine is not thread-safe (fine for the single-threaded evaluator, needs a lock if the app runner shares it); `ModuleContext.load` decodes the screenshot a second time.

## M6 fusion + report (2026-10-10, branch m6-fusion-report)

State before M6: M0-M5, M1b and M10a merged and pushed; M10 blocked at the training gate (branch `m10-detector`, local only).
- **Delivered.** `auditor/fusion` (ADR-021: rule-element-centred fusion, tier/severity helpers, ADR-022 coverage verdicts), `auditor/report` (report.json, self-contained report.html, report.pdf via Chromium, crops, guidance.yaml with verified w3.org technique titles), a real `run_folder` pipeline (stale outputs cleared, VERSIONS.json written before the PDF, a failed PDF is recorded in `stage_status` and does not fail the run), the `hybrid` evaluation condition, and the shared Playwright driver.
- **Evaluation (`make eval`, seed 20261004, 10,000 resamples, sealed truth, automated-only policy, 250 items, none failed).** Two consecutive runs produce byte-identical `metrics.json` (sha256 `fb9487cf5ae6ceccbe93dae8b937c370b0425afb90c118762c582ba6b2586f2d`, superseded: see the M7c correction). Artefact: `eval/2026-10-10/` (metrics.json, tables.md/tex, failures.csv, sensitivity.csv, VERSIONS.json; chromium 153.0.8010.12, axe c24f097b..., protocol e8c35965...).
- **Hybrid vs rule-only, real stratum.** 1.4.3: P 0.709 [0.56, 0.84] R 0.480 [0.34, 0.63] vs P 0.724 R 0.473; ΔPrecision combined CI [-0.029, -0.002], inside the -0.05 margin (non-inferior). 2.5.8: identical to rule-only (P 0.145, R 0.676), the pixel channel adds nothing without DOM geometry. The pixel channel adds 2.4.7 (P 0.683, R 0.667) and 2.4.13 (P 0.747, R 0.397; ADR-017 default-ring question still open) on real pages, which rule-only cannot assess at all. Synthetic stratum: hybrid P = R = 1.0 on all eight criteria. McNemar (exact, BH within stratum): see the M7c correction below; the figure first recorded here compared rule-only with the pixel condition, not with hybrid.
- **Acceptance deviation.** The prompt asks for at least six criteria with a verdict on real fixtures; measured 4 automated / 5 any (ADR-012, ADR-022 amendment). Synthetic captures: 8 of 8.
- **Reviewers.** correctness, protocol, tests, ui-a11y and thesis-evidence ran; every must-fix was applied (single-pass template substitution, nested evidence, pixel-derived severity, empty-box filtering, stale-output cleanup, PDF non-fatal, axe-summary evidence for rule-only findings, report accessibility: non-scaling strokes with halos, labels, forced-colors and print styles, scroll regions, 24 px link targets). The report passes axe (WCAG 2.x A/AA, best-practice) with zero violations in light and dark on a real, a synthetic and a clean report.
- **Golden.** `fixtures/golden/fusion/hand_built.json` is new in this milestone.
- Needs planning: ADR-017 (default focus ring) and ADR-018 (training size) still wait for the researcher.

## M7a web shell, New Audit, run progress (2026-10-10, branch m7a-web-shell)

State before M7a: M0-M6, M1b, M10a merged and pushed; M10 blocked at the training gate.
Scope item -> delivery:
| Item | Delivered by | State |
|---|---|---|
| App shell (top bar, theme toggle, skip link, landmarks) | `app/layout.tsx` | done |
| `/` New Audit: URL tab, validation, paste prefix, viewport toggles, Advanced (condition, focus budget), Audit + Kbd, recent runs table | `components/audit/new-audit-form.tsx`, `recent-runs.tsx` | done |
| Screenshots tab: real file input, drop zone, upload progress | same | done; progress is one aggregate bar, not per file |
| Optional focus-pair upload | none | NOT DONE |
| Favicon on blur | none | NOT DONE |
| `/runs/[id]` progress: stepper, one live region, skeleton canvas, 200 ms cross-fade, cancel dialog, focus to heading on done | `run-view.tsx`, `lib/stages.ts`, `hooks/use-run-events.ts` | done; the eight criteria are one grouped step |
| Boxes appearing per module (30 ms stagger) | none (needs per-module findings in the event stream) | NOT DONE (M7b) |
| Landing state after done (screenshot, counts, links to HTML/JSON) | `run-view.tsx` | done as a minimal landing; panes are M7b |
| API client from generated types, TanStack Query | `api/client.ts` (openapi-fetch on `types.ts`), `lib/query.tsx` | done |
| Endpoints POST /runs, /uploads, GET /runs, /runs/{id}, /events (SSE), assets, report.{json,html,pdf}, cancel | `services/app/app/api.py`, `jobs.py` | done |
| Carry-overs: axe gate to AA+AAA set, input-border contrast, radius/type remap, atomic report writes, job timeouts, CI `--all-packages` | `e2e/axe.spec.ts`, `globals.css`, `pipeline.py`, `jobs.py`, `ci.yml` | done |

- **Tests.** services/app 22 passed (folder run with SSE, uploads, cancel queued and running, timeout, failed run, traversal, startup reconciliation); vitest 31 passed (URL normalisation, stage model); Playwright e2e 13 passed: fixture-folder run to report with the screenshot visible, queued-run cancel, keyboard-only form completed through a real URL capture, axe (WCAG 2.x A/AA/AAA tags, `color-contrast-enhanced` off) on `/`, a real queued run, the finished report, form error and Screenshots-tab states, light and dark.
- **Reviews.** correctness, tests and ui-a11y ran; must-fix items applied: SSE replay and reconnect, stepper going backwards or marking the wrong step failed, cancel/timeout sentinels, orphaned subprocess trees, queued-cancel DB state, upload decompression cap, rule-only on screenshots, 500s on bad folder meta, double submit, focus after a failed submit, double upload bar, per-route titles.
- **Deviation.** PLAN lists `PATCH /findings/{id}` and `/catalogue` among the endpoints; they belong to M7b/M7c and are not built.
- Needs planning: none new. ADR-017 and ADR-018 still wait for the researcher.

## M7b Report screen (2026-10-10, branch m7b-report-screen)

State before M7b: M0-M6, M1b, M10a, M7a merged and pushed; M10 blocked at the training gate.
Scope item -> delivery:
| Item | Delivered by | State |
|---|---|---|
| Three-pane layout, ResizablePanel, collapse to Sheet (<1280) and Tabs (<1024) | `report/report-screen.tsx`, `ui/resizable.tsx` | done (breakpoint 1280, not 1440: ADR-024) |
| Criteria rail: search, summary, 8 SC rows with severity triplets, provenance glyph, legend | `report/criteria-rail.tsx` | done; legend is static text |
| Canvas: img + SVG overlay in react-zoom-pan-pinch, buttons and keys (+ - 0, Shift+arrows), roving tabindex boxes, dual stroke, selection auto-fit, labels toggle, minimap, focus-pair toggle (Focused/Unfocused/Diff), context menu | `report/canvas.tsx`, `focus-pair.tsx` | done |
| Tab cycling through stacked boxes | none (arrows only) | NOT DONE |
| Right pane: evidence card with swatches and crop, fix tabs with copy, status buttons, J/K | `report/detail-pane.tsx` | done; crop is the pipeline's side-by-side image, not a 2x live crop |
| Table: TanStack, virtualised, facets, grouping, aria-rowcount/rowindex/sort, URL state | `report/findings-table.tsx`, `lib/report.ts` | done |
| Empty, partial (with Retry) and error states | `report-screen.tsx` | done; the error log is the run's error text |
| PATCH /findings/{id}, findings/overview/exports/CSV endpoints, ingestion | `services/app/app/report_api.py`, `ingest.py`, migration 0002 | done |
| Sheet returns focus to the box or row that opened it | none | NOT DONE |
| Toolbar arrow-key navigation | none (Tab order) | NOT DONE |
| Per-module staggered boxes during progress (M7a carry-over) | none | NOT DONE |
| Manual VoiceOver + Safari and NVDA + Chrome pass of the report screen | none | NOT DONE: needs the researcher on a Mac and a Windows machine; DESIGN_SPEC section 5 requires it before M7b is closed |

- **Tests.** services/app 28 passed; vitest 46 passed; Playwright e2e 25 passed twice in a row: axe (WCAG 2.x A/AA/AAA tags, `color-contrast-enhanced` off) on the report for both real fixtures in light and dark, on canvas, selected finding and table; axe in the 1100 px sheet, the 800 px tabs, diff mode and the empty-filter state; keyboard test (Tab to canvas, arrow to the third box in reading order, Enter, detail shows it, K goes to the previous finding in table order, J returns); URL state (criterion, view, selection, severity, provenance, search) restored on reload; status change persists across reload; focus-pair views; layout collapse; visual snapshot at 1440x900 (`e2e/report.spec.ts-snapshots/report-1440x900-darwin.png`, recorded on macOS, skipped on other platforms).
- **Real bugs the gate found.** Technique titles in guidance.yaml truncated at a comma (a YAML flow-scalar bug) now covered by a pinned-title test; dimmed overlay text failed 4.5:1; the focus-pair scroll area had no keyboard access; the auto-fit raced the panel layout (a ResizeObserver now refits until the user pans or zooms); the API proxy did not forward PATCH.
- **Reviews.** correctness, tests and ui-a11y ran; applied: lazy ingest and status preservation, CSV formula escaping, deep-link and status-change refits, rAF cleanup, Esc dismisses a box label, focused boxes pan into view, halo under the box focus ring, 24 px resize handles with the global 3 px focus ring, sticky group headers, J/K ignored inside menus and dialogs, debounced search box, once-only empty-state pulse, skip links first, HTML-then-CSS fix tabs, Enter on a rail row focuses the canvas.

## M7c Coverage, Compare, Evaluation (2026-10-10, branch m7c-secondary-screens)

State before M7c: M0-M6, M1b, M10a, M7a, M7b merged and pushed; M10 blocked at the training gate.

**Correction to the M6 evaluation (found while building /eval).** The harness ran McNemar on the first two listed conditions. `make eval` lists `rule_only,pixel,hybrid`, so the M6 run compared rule-only with the *pixel* condition, not hybrid with rule-only as PLAN section 8 requires; the McNemar line in the M6 notes was therefore not the H1 test. ΔPrecision and every precision/recall/F1 cell were computed by condition name and are unchanged. `mcnemar_pair()` now chooses hybrid against rule_only by name (pinned by a unit test), the evaluation was rerun twice with byte-identical output (`metrics.json` sha256 `cfa9c78a162b2a09b509d31162f038a2d51d9fa2824c624860d83e5d0c4ecc8f`, seed 20261004, 10,000 resamples, 250 items, none failed), and `eval/2026-10-10/` and `eval/fixtures/` hold the corrected files. Corrected McNemar (exact, BH within stratum, A = hybrid, B = rule-only), discordant pairs "only hybrid correct / only rule-only correct":
- real: 2.4.7 84 / 39, p 6.1e-5 (BH 9.1e-5); 2.4.13 148 / 50, p 1.9e-12 (BH 5.7e-12); 1.4.3 0 / 4, p 0.125 (not significant; hybrid is not better on real 1.4.3, only non-inferior); 1.4.11, 2.4.11, 2.4.12, 2.5.7, 2.5.8 have no discordant pairs, so no test.
- synthetic: 1.4.3 8 / 0 (BH 0.011), 1.4.11 10 / 0 (0.0046), 2.4.7 7 / 0 (0.018), 2.4.11 15 / 0 (0.0002), 2.4.12 30 / 0 (1.3e-8), 2.4.13 8 / 0 (0.011), 2.5.7 5 / 0 (0.0625, not significant at n = 5); 2.5.8 degenerate.
- ΔPrecision (hybrid minus rule-only), unchanged: real 1.4.3 [-0.031, -0.005], combined [-0.029, -0.002], inside the -0.05 margin; 2.5.8 exactly 0.
- ΔPrecision is estimable only where rule-only makes predictions: 1.4.3 (and 2.5.8, which is exactly 0 because the pixel channel adds nothing without DOM geometry). For 1.4.11, 2.4.7, 2.4.11, 2.4.12, 2.4.13 and 2.5.7 rule-only predicts nothing on real pages, so `n_valid` is 0; H1 non-inferiority is therefore evidenced for 1.4.3 only. The McNemar gains on real 2.4.7 and 2.4.13 compare a channel that can assess the criterion with one that cannot (the coverage argument, RQ3), not two competing detectors.
- Provenance: `VERSIONS.json` in `eval/2026-10-10/` records git `a0f680e` (the commit before the fix) because the rerun used the working tree; the fix commit is the one that adds `mcnemar_pair`. Reproduce with `make eval EVAL_OUT=<dir>` (conditions `rule_only,pixel,hybrid`, seed 20261004, 10,000 resamples). `eval/fixtures/` is a copy used only by the e2e test, not thesis evidence.
- Reading for Chapter 5: the pixel channel gives a significant gain on the two focus criteria it newly covers on real pages, and hybrid is non-inferior but not better than rule-only on real 1.4.3.

Scope item -> delivery:
| Item | Delivered by | State |
|---|---|---|
| `/runs/[id]/coverage`: 8 x 3 grid with glyph, text and finding counts, "reliable verdict: n / 8" per channel, legend, catalogue text per SC from GET /catalogue | `components/views/coverage-screen.tsx`, `app/catalogue.py` | done |
| `/runs/[id]/compare`: hybrid and rule-only canvases with synchronised pan/zoom and selection, diff list | `components/views/compare-screen.tsx`, GET /runs/{id}/compare, `pipeline.write_rule_only`, `lib/compare.ts` | done; rule-only side comes from the same axe run (no second capture); not available for rule-only runs |
| `/eval`: Run button (disabled while running), SSE progress, per-SC P/R/F1 bars with CI whiskers, `role="img"` summary, View as table, strata tabs, McNemar and ΔPrecision table, CSV and LaTeX export | `components/eval/*`, `app/eval_api.py`, `--progress-file` in the CLI | done |
| POST /eval, GET /eval, GET /eval/{id}, /events, export.csv, export.tex | `app/eval_api.py` | done; results import from `EVAL_IMPORT_DIRS` |
| Export menu in the report top bar (JSON/HTML/PDF/CSV with size) | built in M7b (`report/top-bar.tsx`) | done in M7b |
| Hybrid-vs-rule-only comparison for an arbitrary capture without the DOM source (screenshot uploads) | none | NOT DONE: uploads have no rule channel |

- **Tests.** services/app 43 passed (catalogue parse, eval import/list/detail/export and its edge cases, real fixture-benchmark evaluations with progress, simultaneous POST /eval gives one 201 and one 409, compare pairing, PDF export with page count, restart reconciliation); vitest 52 passed; Playwright e2e 40 passed twice in a row, including axe (A/AA/AAA tags, `color-contrast-enhanced` off) on coverage, compare and eval in light and dark and in chart and table views, `/eval` rendered from the committed `eval/fixtures`, CSV/LaTeX/JSON/HTML/CSV downloads opened and checked, and a real evaluation started from the UI and followed to completion.
- **Reviews.** correctness, tests, ui-a11y and thesis-evidence ran; applied: queued-or-running guard under a lock for POST /eval, a separate eval timeout (6 h), failed evaluations when finishing raises, bad import directories skipped, duplicate conditions removed, a final progress event, SSE reads off the event loop, chart series darkened and distinguished by fill patterns (contrast >= 3:1, not colour alone), run button keeps focus (aria-disabled), one persistent polite progress region announcing in 25% steps, strata tabs now control a panel, shorter chart label, a "Sync views" switch and distinct names for the two canvases' controls, axe scans of empty/running/failed eval states and a rule-only compare page, a hermetic data directory per e2e run.
- **Not done (recorded).** The two compare canvases share one transform bus with an 80 ms echo guard (not a revision counter); selection in the diff list highlights the canvas box without scrolling to it; the manual VoiceOver/NVDA pass of M7b still stands open.

