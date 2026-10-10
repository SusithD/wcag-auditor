# Failure taxonomy

From failures.csv (every false positive and false negative, with page features).

### rule_only: failures per criterion and stratum

| SC | real FP | real FN | synthetic FP | synthetic FN |
|---|---|---|---|---|
| 1.4.3 | 249 | 728 | 0 | 8 |
| 1.4.11 | 0 | 96 | 0 | 20 |
| 2.4.7 | 0 | 126 | 0 | 7 |
| 2.4.11 | 0 | 11 | 0 | 15 |
| 2.4.12 | 0 | 15 | 0 | 30 |
| 2.4.13 | 0 | 373 | 0 | 8 |
| 2.5.7 | 0 | 0 | 0 | 5 |
| 2.5.8 | 136 | 11 | 0 | 0 |

### rule_only: real-stratum failures by page feature

| feature | value | FP | FN |
|---|---|---|---|
| non-responsive | False | 381 | 1331 |
| non-responsive | True | 4 | 29 |
| sector | com | 133 | 673 |
| sector | gov | 0 | 15 |
| sector | org | 152 | 262 |
| sector | other | 100 | 410 |

### pixel: failures per criterion and stratum

| SC | real FP | real FN | synthetic FP | synthetic FN |
|---|---|---|---|---|
| 1.4.3 | 22 | 1366 | 0 | 0 |
| 1.4.11 | 0 | 96 | 0 | 0 |
| 2.4.7 | 39 | 42 | 0 | 0 |
| 2.4.11 | 0 | 11 | 0 | 0 |
| 2.4.12 | 0 | 15 | 0 | 0 |
| 2.4.13 | 50 | 225 | 0 | 0 |
| 2.5.7 | 0 | 0 | 0 | 0 |
| 2.5.8 | 0 | 34 | 0 | 0 |

### pixel: real-stratum failures by page feature

| feature | value | FP | FN |
|---|---|---|---|
| non-responsive | False | 72 | 1758 |
| non-responsive | True | 39 | 31 |
| sector | com | 72 | 911 |
| sector | gov | 1 | 5 |
| sector | org | 13 | 297 |
| sector | other | 25 | 576 |

### hybrid: failures per criterion and stratum

| SC | real FP | real FN | synthetic FP | synthetic FN |
|---|---|---|---|---|
| 1.4.3 | 272 | 718 | 0 | 0 |
| 1.4.11 | 0 | 96 | 0 | 0 |
| 2.4.7 | 39 | 42 | 0 | 0 |
| 2.4.11 | 0 | 11 | 0 | 0 |
| 2.4.12 | 0 | 15 | 0 | 0 |
| 2.4.13 | 50 | 225 | 0 | 0 |
| 2.5.7 | 0 | 0 | 0 | 0 |
| 2.5.8 | 136 | 11 | 0 | 0 |

### hybrid: real-stratum failures by page feature

| feature | value | FP | FN |
|---|---|---|---|
| non-responsive | False | 454 | 1110 |
| non-responsive | True | 43 | 8 |
| sector | com | 205 | 528 |
| sector | gov | 1 | 5 |
| sector | org | 165 | 224 |
| sector | other | 126 | 361 |
