#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
phase=${1:?usage: train_detector.sh phase1|phase2|export-phase1}
trap '' HUP
dataset=${DATASET:-data/webui/prepared_full}
out=${OUT:-data/models/rfdetr-nano-full}
export PYTORCH_ENABLE_MPS_FALLBACK=1
export PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.85
export PYTORCH_MPS_LOW_WATERMARK_RATIO=0.65
run_with_retries() {
  local rc attempt
  for attempt in 1 2 3 4 5; do
    echo "attempt $attempt: $(date)" >>"$out/train.log"
    rc=0
    caffeinate -i "${train[@]}" "$@" --resume-latest >>"$out/train.log" 2>&1 || rc=$?
    [ "$rc" -eq 0 ] && return 0
    echo "attempt $attempt exited with $rc" >>"$out/train.log"
    case $rc in 2|3|4) return "$rc" ;; esac
    sleep 20
  done
  return 1
}
train=(uv run python -m auditor.detector.train --dataset "$dataset" --out "$out" --model nano --epochs 20 --batch-size 4 --grad-accum 2 --num-workers 2 --resolution 576 --device mps)
case $phase in
  phase1)
    mkdir -p "$out"
    echo "logging to $out/train.log (tail -f it)"
    run_with_retries --stop-after-epoch 10
    ;;
  phase2)
    [ -e "$out/checkpoint_9.ckpt" ] || { echo "no epoch-10 checkpoint in $out; run phase 1 first" >&2; exit 1; }
    if [ ! -e "$out/ema_epoch10.pth" ]; then
      [ "$out/last_ema.pth" -nt "$out/checkpoint_9.ckpt" ] || { echo "last_ema.pth is missing or older than checkpoint_9.ckpt" >&2; exit 1; }
      cp "$out/last_ema.pth" "$out/ema_epoch10.pth"
    fi
    echo "logging to $out/train.log (tail -f it)"
    run_with_retries
    ;;
  export-phase1)
    [ -e "$out/ema_epoch10.pth" ] || cp "$out/last_ema.pth" "$out/ema_epoch10.pth"
    uv run python -m auditor.detector.export_onnx "$out/ema_epoch10.pth" --out "$out/phase1-export" --model nano --resolution 576
    cp "$out"/phase1-export/*.onnx data/models/detector-phase1.onnx
    awk -F, 'NR==1{for(i=1;i<=NF;i++)c[$i]=i} $c["epoch"]==9 && $c["val/ema_mAP_50_95"]!=""{print "epoch 10 EMA mAP50:95=" $c["val/ema_mAP_50_95"] " mAP50=" $c["val/ema_mAP_50"]}' "$out/metrics.csv" | tail -1 | grep . || { echo "no epoch-10 EMA mAP row in metrics.csv" >&2; exit 1; }
    ;;
  *) echo "unknown phase $phase" >&2; exit 2 ;;
esac
