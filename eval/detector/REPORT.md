# Detector validation report

Model `data/models/detector.onnx` (sha256 `2e3053dc6433b47c`), evaluated with onnxruntime on CPU on the held-out WebUI validation split (1500 images, 47194 boxes; manifest `52c8c8057943db89`). Each image is squashed to 576 x 576, no tiling, one class per query (the shipped postprocess) with a score floor of 0.001. COCO mAP, 101-point interpolation, IoU 0.50:0.95.

| metric | value |
|---|---|
| mAP 50:95 | 0.2393 |
| mAP 50 | 0.3939 |
| mAP 75 | 0.2478 |
| mAR (100 detections) | 0.3498 |

| class | AP 50:95 |
|---|---|
| text | 0.3401 |
| link | 0.3491 |
| button | 0.1834 |
| input | 0.3030 |
| choice | 0.1580 |
| image_icon | 0.1020 |

Training-time validation of the same weights (EMA, PyTorch, `metrics.csv`), per epoch:

| epoch | mAP 50:95 | mAP 50 |
|---|---|---|
| 1 | 0.1297 | 0.2514 |
| 2 | 0.1662 | 0.3091 |
| 3 | 0.1839 | 0.3453 |
| 4 | 0.1967 | 0.3644 |
| 5 | 0.2038 | 0.3662 |
| 6 | 0.2056 | 0.3716 |
| 7 | 0.2130 | 0.3757 |
| 8 | 0.2190 | 0.3839 |
| 9 | 0.2249 | 0.3852 |
| 10 | 0.2258 | 0.3869 |
| 11 | 0.2278 | 0.3945 |
| 12 | 0.2280 | 0.3995 |
| 13 | 0.2340 | 0.4004 |
| 14 | 0.2353 | 0.3995 |
| 15 | 0.2350 | 0.4084 |
| 16 | 0.2398 | 0.4016 |
| 17 | 0.2459 | 0.4099 |
| 18 | 0.2526 | 0.4256 |
| 19 | 0.2459 | 0.4173 |
| 20 | 0.2508 | 0.4160 |

The ONNX figure differs slightly from the epoch-20 training figure because the training evaluator and the shipped postprocess are not identical (query-level top-k versus one class per query). This is the validation split, not the 110-page benchmark.
