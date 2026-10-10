# Confidence calibration

Module scores of every assessable finding (automated and needs-review tiers, before the tier policy is applied, so n differs from the precision tables) against ground truth. A page finding is correct when it is matched one-to-one to a labelled box (duplicates on a claimed box are incorrect); a focus finding is correct when its stop is a labelled positive. The pixel and hybrid conditions share the same pixel findings, so the rows are not additive. ECE uses ten equal-width bins; Brier is the mean squared error of the score as a probability.

| condition | stratum | findings | accuracy | mean score | ECE | Brier |
|---|---|---|---|---|---|---|
| hybrid | real | 3001 | 0.483 | 0.765 | 0.294 | 0.290 |
| hybrid | synthetic | 154 | 0.987 | 0.897 | 0.090 | 0.043 |
| hybrid | combined | 3155 | 0.507 | 0.772 | 0.276 | 0.278 |
| pixel | real | 2106 | 0.638 | 0.648 | 0.074 | 0.232 |
| pixel | synthetic | 155 | 0.981 | 0.729 | 0.252 | 0.118 |
| pixel | combined | 2261 | 0.662 | 0.653 | 0.085 | 0.224 |

## Accuracy by tier

| condition | stratum | tier | findings | accuracy | mean score |
|---|---|---|---|---|---|
| hybrid | real | automated | 1493 | 0.660 | 0.943 |
| hybrid | real | needs-review | 1508 | 0.306 | 0.589 |
| hybrid | synthetic | automated | 152 | 1.000 | 0.902 |
| hybrid | synthetic | needs-review | 2 | 0.000 | 0.500 |
| hybrid | combined | automated | 1645 | 0.692 | 0.939 |
| hybrid | combined | needs-review | 1510 | 0.306 | 0.589 |
| pixel | real | automated | 359 | 0.685 | 0.757 |
| pixel | real | needs-review | 1747 | 0.629 | 0.625 |
| pixel | synthetic | automated | 155 | 0.981 | 0.729 |
| pixel | combined | automated | 514 | 0.774 | 0.749 |
| pixel | combined | needs-review | 1747 | 0.629 | 0.625 |
