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
- **Deviations / limits:** the default `--conditions` is `rule_only` (PLAN §8 says `hybrid,rule_only`; hybrid raises `NotImplementedError` until modules exist, M4-M6, and is rejected before any page is processed). Hybrid-vs-rule-only McNemar, ΔPrecision and BH are implemented but only unit-tested on constructed data. Greedy ordering inside `match_boxes` no longer matters (multi-credit). Per-capture axe failures are recorded in `items_failed` and the item is left out of scoring. Boxless axe nodes and zero-size boxes are dropped and counted (`rule_findings_dropped`; none occurred on the benchmark). Desktop and mobile captures of one site are treated as separate bootstrap clusters. The M4 branch holds paused work.
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
