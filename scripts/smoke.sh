#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

folder=$(ls -d fixtures/synth/sc1-4-3/*/ | head -1)
out=data/smoke
rm -rf "$out"
uv run auditor run --folder "$folder" --out "$out"
uv run python -c "
from pathlib import Path
from auditor.schema import Run
run = Run.model_validate_json(Path('$out/report.json').read_text())
print('report.json valid:', run.id, len(run.coverage.cells), 'coverage cells')
"

port=${APP_PORT:-8000}
.venv/bin/uvicorn app.main:app --app-dir services/app --port "$port" >"$out/uvicorn.log" 2>&1 &
pid=$!
trap 'kill $pid 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  curl -sf "localhost:$port/health" >/dev/null 2>&1 && break
  sleep 0.2
done
curl -sf "localhost:$port/health"
echo
kill $pid
wait $pid 2>/dev/null || true
trap - EXIT

pnpm -C apps/web build
