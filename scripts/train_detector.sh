#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
phase=${1:?usage: train_detector.sh phase1|phase2|export-phase1}
dataset=${DATASET:-data/webui/prepared_full}
out=${OUT:-data/models/rfdetr-nano-full}
export PYTORCH_ENABLE_MPS_FALLBACK=1
train=(uv run python -m auditor.detector.train --dataset "$dataset" --out "$out" --model nano --epochs 20 --batch-size 8 --resolution 576 --device mps)
case $phase in
  phase1)
    [ -e "$out/checkpoint_9.ckpt" ] && { echo "phase 1 already finished: $out/checkpoint_9.ckpt exists" >&2; exit 1; }
    exec caffeinate -i "${train[@]}" --stop-after-epoch 10
    ;;
  phase2)
    [ -e "$out/checkpoint_9.ckpt" ] || { echo "no epoch-10 checkpoint in $out; run phase 1 first" >&2; exit 1; }
    [ -e "$out/ema_epoch10.pth" ] || cp "$out/last_ema.pth" "$out/ema_epoch10.pth"
    exec caffeinate -i "${train[@]}" --resume "$out/checkpoint_9.ckpt"
    ;;
  export-phase1)
    [ -e "$out/ema_epoch10.pth" ] || cp "$out/last_ema.pth" "$out/ema_epoch10.pth"
    uv run python -m auditor.detector.export_onnx "$out/ema_epoch10.pth" --out "$out/phase1-export" --model nano --resolution 576
    cp "$out"/phase1-export/*.onnx data/models/detector-phase1.onnx
    awk -F, 'NR==1{for(i=1;i<=NF;i++)c[$i]=i} $c["epoch"]==9 && $c["val/ema_mAP_50_95"]!=""{print "epoch 10 EMA mAP50:95=" $c["val/ema_mAP_50_95"] " mAP50=" $c["val/ema_mAP_50"]}' "$out/metrics.csv" | tail -1 | grep . || { echo "no epoch-10 EMA mAP row in metrics.csv" >&2; exit 1; }
    ;;
  *) echo "unknown phase $phase" >&2; exit 2 ;;
esac
