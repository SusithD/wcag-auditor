# WCAG Auditor

**An ML-assisted accessibility auditor for web UI screenshots, aligned with WCAG 2.2.**

Final-year research artefact by L.W.S.D. Alwis (NIBM / Coventry University). It combines a rule engine (axe-core) with a pixel-measurement channel so that criteria no DOM rule can decide, such as focus visibility and focus appearance, still get an evidence-backed verdict. The Python library in `packages/auditor` is the product and the thesis artefact; the API and web app wrap it.

## What it does

| Stage | What happens |
|---|---|
| **Capture** | Renders a URL at desktop (1440×900) and mobile (390×844) in Chromium. Saves a full-page screenshot, the DOM, one focused/unfocused PNG pair per keyboard focus stop, and `meta.json`. Existing capture folders can be replayed offline. |
| **Rule channel** | axe-core 4.13 (WCAG 2.2 ruleset) for 1.4.3 contrast and 2.5.8 target size. |
| **Pixel channel** | One measurement module per criterion: 1.4.3, 1.4.11, 2.4.7, 2.4.11, 2.4.12, 2.4.13, 2.5.7, 2.5.8. Thresholds and rulings come from Annotation Protocol v1.1 in a single `protocol.yaml`. |
| **Fusion** | Matches rule and pixel findings into one finding per element, with provenance (`rule`, `pixel` or `both`), a tier (`automated`, `needs-review`, `not-assessable`) and a score. |
| **Coverage** | Per run, shows which channel returned a verdict for each criterion. |
| **Report** | Findings drawn on the screenshot with evidence, WCAG reference and fix guidance, in `hybrid` and `rule-only` conditions. |
| **Evaluation** | Scores a frozen benchmark against ground truth and produces the thesis tables. |

## Status

Built milestone by milestone, one branch each (see [PROGRESS.md](PROGRESS.md) and [PLAN.md](PLAN.md) §10).

| | Milestone | State |
|---|---|---|
| M0 | Monorepo scaffold: schema, `protocol.yaml`, fixtures, FastAPI + SQLite, Next.js shell | done |
| M1 | Capture port and offline replay | done |
| M2 | Rule channel and evaluation harness | blocked on sealed ground truth |
| M3 | Coordinate frames, DOM element source, page features | done |
| M4–M11 | Modules, fusion, report, web screens, full evaluation, study build, detector | not started |

Nothing in the pipeline produces findings yet: `auditor run` currently writes an empty, schema-valid report.

## Architecture

```
apps/web (Next.js 16, TypeScript, shadcn/ui on Base UI)
   │ HTTP + SSE
   ▼
services/app (FastAPI, SQLite via SQLAlchemy 2 + Alembic, in-process job runner)
   │ subprocess: `auditor run …`
   ▼
packages/auditor (pure Python library + Typer CLI)
   capture/  frames  elements/  features  modules/  schema  protocol.yaml
```

The library runs without the web app. Every run records `VERSIONS.json` (Chromium, Playwright, axe-core hash, model hash, protocol hash, git SHA).

```
packages/auditor   library and CLI (the thesis artefact)
services/app       API, database, job runner
apps/web           web interface
fixtures/          small copies of benchmark captures, ground truth and goldens
```

## Getting started

Requires Python 3.12 with [uv](https://docs.astral.sh/uv/), Node 22+ with pnpm, and Chromium for Playwright.

```bash
cp .env.example .env              # set BENCHMARK_DIR and TRUTH_PATH if you have the benchmark
uv sync
uv run playwright install chromium
pnpm -C apps/web install
```

```bash
make check          # ruff, mypy, pytest (no browser), biome, vitest
make test-browser   # browser tests (need Chromium and the benchmark tooling)
make smoke          # stub pipeline on a fixture, /health, web build
pnpm -C apps/web e2e   # axe-core gate on the web app (set WEB_PORT if 3000 is busy)
```

```bash
uv run auditor capture https://example.com --out data/captures   # capture a page
uv run auditor run --folder <capture folder> --out data/runs/demo # replay a capture
uv run uvicorn app.main:app --app-dir services/app                 # API on :8000
pnpm -C apps/web dev                                               # web app
```

## Deploy

- [docs/DEPLOY_HF.md](docs/DEPLOY_HF.md): recommended free option, a Hugging Face Docker Space (no card needed).
- [docs/DEPLOY.md](docs/DEPLOY.md): Oracle Cloud Always Free VM or a Mac with a Cloudflare Tunnel.

## Documents

| File | Purpose |
|---|---|
| [PLAN.md](PLAN.md) | Implementation contract: architecture, stack, data model, API, milestones |
| [CHECK_CATALOGUE.md](CHECK_CATALOGUE.md) | Criterion → decision procedure → detectability class |
| [DESIGN_SPEC.md](DESIGN_SPEC.md) | UI/UX specification and design tokens |
| [DECISIONS.md](DECISIONS.md) | Architecture decision records |
| [NOTES.md](NOTES.md) | Running implementation log for the thesis |
| [FAILED_ATTEMPTS.md](FAILED_ATTEMPTS.md) | Rejected approaches |
| [fixtures/README.md](fixtures/README.md) | Capture folder layout and `meta.json` keys |

## Benchmark data

The frozen benchmark, its ground truth and the vendored `axe.min.js` source live in a sibling `04_Data_Collection/` directory outside this repository and are read-only from here. Only five small capture folders are copied into `fixtures/`.
