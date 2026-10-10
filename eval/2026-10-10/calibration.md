# Confidence calibration

Module scores of every assessable finding (automated and needs-review tiers, before the tier policy is applied, so n differs from the precision tables) against ground truth. A page finding is correct when it is matched one-to-one to a labelled box (duplicates on a claimed box are incorrect); a focus finding is correct when its stop is a labelled positive. The pixel and hybrid conditions share the same pixel findings, so the rows are not additive. ECE uses ten equal-width bins; Brier is the mean squared error of the score as a probability.

| condition | stratum | findings | accuracy | mean score | ECE | Brier |
|---|---|---|---|---|---|---|
| hybrid | real | 3263 | 0.499 | 0.762 | 0.269 | 0.279 |
| hybrid | synthetic | 154 | 0.987 | 0.897 | 0.090 | 0.043 |
| hybrid | combined | 3417 | 0.521 | 0.768 | 0.253 | 0.269 |
| pixel | real | 2368 | 0.644 | 0.656 | 0.061 | 0.224 |
| pixel | synthetic | 155 | 0.981 | 0.729 | 0.252 | 0.118 |
| pixel | combined | 2523 | 0.664 | 0.661 | 0.054 | 0.217 |

## Accuracy by tier

| condition | stratum | tier | findings | accuracy | mean score |
|---|---|---|---|---|---|
| hybrid | real | automated | 1754 | 0.665 | 0.911 |
| hybrid | real | needs-review | 1509 | 0.306 | 0.589 |
| hybrid | synthetic | automated | 152 | 1.000 | 0.902 |
| hybrid | synthetic | needs-review | 2 | 0.000 | 0.500 |
| hybrid | combined | automated | 1906 | 0.692 | 0.910 |
| hybrid | combined | needs-review | 1511 | 0.306 | 0.589 |
| pixel | real | automated | 620 | 0.687 | 0.744 |
| pixel | real | needs-review | 1748 | 0.628 | 0.625 |
| pixel | synthetic | automated | 155 | 0.981 | 0.729 |
| pixel | combined | automated | 775 | 0.746 | 0.741 |
| pixel | combined | needs-review | 1748 | 0.628 | 0.625 |
