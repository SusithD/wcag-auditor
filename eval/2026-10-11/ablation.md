# Element-source ablation: DOM boxes vs detector boxes

- benchmark_sha: a3bb9457728bd32c9094894d5c172a2e5a7d5d6322a86090cf9bb2f86a2d557d
- protocol_sha: a46020528ec1dc1c4e6f5a1b167044dd56c9bb792be877818a54eb679ffc365e
- detector loaded in the detector run: True
- the DOM source has no geometry for the benchmark's real pages (ADR-012), so the real-stratum DOM cells reflect OCR-only boxes there

## real

| SC | DOM P | DOM R | Detector P | Detector R | dR |
|---|---|---|---|---|---|
| 1.4.3 | 0.780 | 0.816 | 0.780 | 0.816 | 0.000 |
| 1.4.11 | n/a | 0.000 | 0.124 | 0.438 | 0.438 |
| 2.4.7 | 0.677 | 0.667 | 0.677 | 0.667 | 0.000 |
| 2.4.11 | 0.088 | 1.000 | 0.088 | 1.000 | 0.000 |
| 2.4.12 | n/a | 0.000 | n/a | 0.000 | 0.000 |
| 2.4.13 | 0.698 | 0.879 | 0.698 | 0.879 | 0.000 |
| 2.5.7 | n/a | n/a | n/a | n/a | n/a |
| 2.5.8 | n/a | 0.000 | 0.000 | 0.000 | 0.000 |

## synthetic

| SC | DOM P | DOM R | Detector P | Detector R | dR |
|---|---|---|---|---|---|
| 1.4.3 | 1.000 | 1.000 | 0.789 | 1.000 | 0.000 |
| 1.4.11 | 1.000 | 1.000 | 0.500 | 1.000 | 0.000 |
| 2.4.7 | 1.000 | 1.000 | 1.000 | 1.000 | 0.000 |
| 2.4.11 | 1.000 | 1.000 | 1.000 | 1.000 | 0.000 |
| 2.4.12 | 1.000 | 1.000 | n/a | 0.000 | -1.000 |
| 2.4.13 | 1.000 | 1.000 | 1.000 | 1.000 | 0.000 |
| 2.5.7 | 1.000 | 1.000 | n/a | 0.000 | -1.000 |
| 2.5.8 | 1.000 | 1.000 | n/a | 0.000 | -1.000 |

