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
- Deviation: the meta-key superset test excludes the 7 origin-specific keys (synthetic seeding / WebUI sampling), see `fixtures/README.md`.
- `fixtures/sites/static.html` created (the milestone referenced it but it did not exist).
