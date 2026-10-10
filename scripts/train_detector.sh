#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
model=${1:-nano}
out=data/models/rfdetr-$model
export PYTORCH_ENABLE_MPS_FALLBACK=1
resume=()
last=$(ls -t "$out"/last.ckpt "$out"/checkpoint_*.ckpt 2>/dev/null | head -1 || true)
[ -n "$last" ] && resume=(--resume "$last")
exec caffeinate -i uv run python -m auditor.detector.train --model "$model" --out "$out" ${resume[@]+"${resume[@]}"} "${@:2}"
