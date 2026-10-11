# Confidence calibration

Module scores of every assessable finding (automated and needs-review tiers, before the tier policy is applied, so n differs from the precision tables) against ground truth. A page finding is correct when it is matched one-to-one to a labelled box (duplicates on a claimed box are incorrect); a focus finding is correct when its stop is a labelled positive. The pixel and hybrid conditions share the same pixel findings, so the rows are not additive. ECE uses ten equal-width bins; Brier is the mean squared error of the score as a probability.

| condition | stratum | findings | accuracy | mean score | ECE | Brier |
|---|---|---|---|---|---|---|
| hybrid | real | 3620 | 0.461 | 0.749 | 0.288 | 0.285 |
| hybrid | synthetic | 154 | 0.987 | 0.897 | 0.090 | 0.043 |
| hybrid | combined | 3774 | 0.483 | 0.755 | 0.272 | 0.275 |
| pixel | real | 2725 | 0.575 | 0.653 | 0.085 | 0.239 |
| pixel | synthetic | 155 | 0.981 | 0.729 | 0.252 | 0.118 |
| pixel | combined | 2880 | 0.597 | 0.657 | 0.072 | 0.232 |

## Accuracy by tier

| condition | stratum | tier | findings | accuracy | mean score |
|---|---|---|---|---|---|
| hybrid | real | automated | 1754 | 0.665 | 0.911 |
| hybrid | real | needs-review | 1866 | 0.270 | 0.597 |
| hybrid | synthetic | automated | 152 | 1.000 | 0.902 |
| hybrid | synthetic | needs-review | 2 | 0.000 | 0.500 |
| hybrid | combined | automated | 1906 | 0.692 | 0.910 |
| hybrid | combined | needs-review | 1868 | 0.270 | 0.597 |
| pixel | real | automated | 620 | 0.687 | 0.744 |
| pixel | real | needs-review | 2105 | 0.542 | 0.627 |
| pixel | synthetic | automated | 155 | 0.981 | 0.729 |
| pixel | combined | automated | 775 | 0.746 | 0.741 |
| pixel | combined | needs-review | 2105 | 0.542 | 0.627 |
