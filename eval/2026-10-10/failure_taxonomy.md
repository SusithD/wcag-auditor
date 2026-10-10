# Failure taxonomy

From failures.csv (every false positive and false negative, with page features).

### rule_only: failures per criterion and stratum

| SC | real FP | real FN | synthetic FP | synthetic FN |
|---|---|---|---|---|
| 1.4.3 | 873 | 518 | 2 | 0 |
| 1.4.11 | 0 | 96 | 0 | 20 |
| 2.4.7 | 0 | 126 | 0 | 7 |
| 2.4.11 | 0 | 11 | 0 | 15 |
| 2.4.12 | 0 | 15 | 0 | 30 |
| 2.4.13 | 0 | 373 | 0 | 8 |
| 2.5.7 | 0 | 0 | 0 | 5 |
| 2.5.8 | 140 | 7 | 0 | 0 |

### rule_only: real-stratum failures by page feature

| feature | value | FP | FN |
|---|---|---|---|
| non-responsive | False | 998 | 1117 |
| non-responsive | True | 15 | 29 |
| sector | com | 419 | 620 |
| sector | gov | 15 | 15 |
| sector | org | 218 | 253 |
| sector | other | 361 | 258 |

### pixel: failures per criterion and stratum

| SC | real FP | real FN | synthetic FP | synthetic FN |
|---|---|---|---|---|
| 1.4.3 | 318 | 254 | 0 | 0 |
| 1.4.11 | 0 | 96 | 0 | 0 |
| 2.4.7 | 40 | 42 | 0 | 0 |
| 2.4.11 | 114 | 0 | 0 | 0 |
| 2.4.12 | 0 | 15 | 0 | 0 |
| 2.4.13 | 142 | 45 | 0 | 0 |
| 2.5.7 | 0 | 0 | 0 | 0 |
| 2.5.8 | 0 | 34 | 0 | 0 |

### pixel: real-stratum failures by page feature

| feature | value | FP | FN |
|---|---|---|---|
| non-responsive | False | 571 | 461 |
| non-responsive | True | 43 | 25 |
| sector | com | 358 | 312 |
| sector | gov | 5 | 5 |
| sector | org | 50 | 63 |
| sector | other | 201 | 106 |

### hybrid: failures per criterion and stratum

| SC | real FP | real FN | synthetic FP | synthetic FN |
|---|---|---|---|---|
| 1.4.3 | 1131 | 325 | 2 | 0 |
| 1.4.11 | 0 | 96 | 0 | 0 |
| 2.4.7 | 40 | 42 | 0 | 0 |
| 2.4.11 | 114 | 0 | 0 | 0 |
| 2.4.12 | 0 | 15 | 0 | 0 |
| 2.4.13 | 142 | 45 | 0 | 0 |
| 2.5.7 | 0 | 0 | 0 | 0 |
| 2.5.8 | 140 | 7 | 0 | 0 |

### hybrid: real-stratum failures by page feature

| feature | value | FP | FN |
|---|---|---|---|
| non-responsive | False | 1510 | 523 |
| non-responsive | True | 57 | 7 |
| sector | com | 761 | 288 |
| sector | gov | 20 | 5 |
| sector | org | 260 | 72 |
| sector | other | 526 | 165 |
