# Fixtures

Five capture folders copied unmodified from the frozen benchmark (`../04_Data_Collection/benchmark_captures`, read-only), plus each folder's ground truth as `truth.json`.

| Folder | Kind | Why |
|---|---|---|
| `synth/sc1-4-3/synth_sc1-4-3_001_desktop_20261004T060449Z` | synthetic, desktop | 1.4.3, one seeded violation |
| `synth/sc2-4-13/synth_sc2-4-13_091_desktop_20261004T061309Z` | synthetic, desktop | 2.4.13, one focus stop |
| `synth/sc2-5-8/synth_sc2-5-8_126_desktop_20261004T061625Z` | synthetic, desktop | 2.5.8, four violations |
| `real/real_com_003_desktop_20261004T054402Z` | real (WebUI), desktop | 15 focus stops, 7 page annotations |
| `real/real_com_011_mobile_20261004T054738Z` | real (WebUI), mobile, **non-responsive** | `png_scale` 0.398, layout width 980; PNGs are the original files (not downscaled) |

No PNG exceeded 200 KB except `real_com_011_mobile.../screenshot.png` (about 976 KB), kept at original resolution because the `png_scale` round-trip tests need the real pixels. All other PNGs are untouched; none needed downscaling.

## Capture folder layout

Produced by `capture_and_select.py` (the benchmark metadata says `generator_version` 2.2.0 in `meta.json`, 2.3.0 in the benchmark README; CLAUDE.md names v2.4.0, which the M1 port will emit). One folder per page per viewport, named `<origin>_<sector>_<id>_<viewport>_<UTC timestamp>`.

```
screenshot.png          full-page screenshot, DSF 1: 1 px = 1 CSS px
focus-NNN.png           viewport image with keyboard focus on tab stop NNN
focus-NNN-off.png       the same viewport, nothing focused (state differencing for 2.4.13)
dom.html                rendered DOM
proxy_findings.json     automated proxy signals (NOT ground truth)
meta.json               capture metadata (keys below)
truth.json              ground truth for this folder (see below)
```

## meta.json keys

Seen in every fixture:

| Key | Meaning |
|---|---|
| `origin`, `sector`, `page_id` | `synth` or `real`; sector (synthetic: `sc<N>-<N>-<N>`; real: TLD proxy `com/org/gov/other`); numeric benchmark id |
| `viewport` | `desktop` (1440x900) or `mobile` (390x844) |
| `viewport_spec` | `width`, `height`, `is_mobile`, `has_touch`, `device_scale_factor` |
| `capture_timestamp`, `url`, `final_url`, `http_status`, `title` | provenance of the capture |
| `screenshot_mode`, `screenshot_sha256` | `full_page`; hash of `screenshot.png` |
| `focus_step_count`, `focus_steps[]`, `focus_run` | keyboard stops (below); `focus_run` = `{presses, stop_reason}` (`left-page` or `max-steps`) |
| `layout` | `has_meta_viewport`, `layout_width`, `scroll_width`, `inner_width`, `visual_viewport_scale` |
| `test_elements_rendered` | rendered test boxes (`id`, `rect`, `occluded_samples`, `samples`) |
| `coordinates` | prose statement of the frame rules |
| `generator_version`, `protocol_version`, `tools` | `tools` = `{browser: "chromium 153.0.8010.12", playwright: "1.63.0"}` |

Synthetic only: `synthetic_page_id`, `seeded_sc`. Real only: `webui_page_id`, `domain`, `selected_for_proxy_signals`, `sampling_frame`.

Each `focus_steps[]` entry: `index`, `file_on`, `file_off`, `uid`, `tag`, `role`, `name`, `selector`, `rect` (CSS px, `x y w h`), `scroll` (`x y`), `png_scale`. A focus stop's position in its PNG is `rect * png_scale`; its document position is `rect + scroll`. `png_scale` is below 1 when a non-responsive page is shown zoomed out under mobile emulation (0.398 in the mobile fixture).

## truth.json

Parsed by `auditor.schema.Truth`.

- **Synthetic** (generator output): `page_id`, `viewport`, `annotations[]` (`annotation_id`, `sc`, `severity`, `confidence`, `bbox`, `boundary`, `note`, `element_id`), `test_elements[]`, plus generator metadata.
- **Real** (extracted from `annotation/benchmark_ground_truth.json`, protocol 1.1, by `page_id`): `page_id`, `viewport`, `annotations[]` (`sc`, `bbox`, `severity`, `source`, `note`) and `focus_judgments[]` per stop: `index`, `v247` (`yes|no|not-assessable`), `obs` (`none|partial|entire`), `v2413` (`meets|fails|na|not-assessable`).

`bbox` is `{x, y, w, h}` in document CSS px. Page SCs (1.4.3, 1.4.11, 2.5.7, 2.5.8) are matched by IoU; focus SCs (2.4.x) by `index` into `focus_judgments` (ADR-006).

## meta.json key union (benchmark, M1)

Union of `meta.json` keys across the 410 benchmark folders (generator 2.2.0 and 2.3.0): `capture_timestamp`, `coordinates`, `domain`, `final_url`, `focus_run`, `focus_step_count`, `focus_steps`, `generator_version`, `http_status`, `layout`, `origin`, `page_id`, `protocol_version`, `sampling_frame`, `screenshot_mode`, `screenshot_sha256`, `sector`, `seeded_sc`, `selected_for_proxy_signals`, `synthetic_page_id`, `test_elements_rendered`, `title`, `tools`, `truth_note`, `url`, `viewport`, `viewport_spec`, `webui_page_id`.

`auditor capture` emits every key except the origin-specific ones (`domain`, `sampling_frame`, `seeded_sc`, `selected_for_proxy_signals`, `synthetic_page_id`, `truth_note`, `webui_page_id`), which only exist for benchmark sampling and synthetic seeding. `test_meta_keys_superset_of_benchmark` enforces this. New captures set `generator_version` to the auditor's own version (`auditor-<version>`) and write `VERSIONS.json` beside `meta.json`.

`fixtures/sites/static.html` is the page served by the browser tests.
