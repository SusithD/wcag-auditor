# Confidence calibration

Module scores of every assessable finding (automated and needs-review tiers) against ground truth. A finding is correct when it lands on a labelled positive. ECE uses ten equal-width bins; Brier is the mean squared error of the score as a probability.

| condition | stratum | findings | accuracy | mean score | ECE | Brier |
|---|---|---|---|---|---|---|
| hybrid | real | 3004 | 0.557 | 0.765 | 0.253 | 0.242 |
| hybrid | synthetic | 154 | 0.987 | 0.897 | 0.090 | 0.043 |
| hybrid | combined | 3158 | 0.578 | 0.771 | 0.238 | 0.233 |
| pixel | real | 2109 | 0.749 | 0.648 | 0.144 | 0.199 |
| pixel | synthetic | 155 | 1.000 | 0.729 | 0.271 | 0.117 |
| pixel | combined | 2264 | 0.766 | 0.653 | 0.152 | 0.193 |

## Accuracy by tier

| condition | stratum | tier | findings | accuracy | mean score |
|---|---|---|---|---|---|
| hybrid | real | automated | 1496 | 0.722 | 0.942 |
| hybrid | real | needs-review | 1508 | 0.394 | 0.589 |
| hybrid | synthetic | automated | 152 | 1.000 | 0.902 |
| hybrid | synthetic | needs-review | 2 | 0.000 | 0.500 |
| hybrid | combined | automated | 1648 | 0.748 | 0.939 |
| hybrid | combined | needs-review | 1510 | 0.393 | 0.589 |
| pixel | real | automated | 362 | 0.685 | 0.756 |
| pixel | real | needs-review | 1747 | 0.762 | 0.625 |
| pixel | synthetic | automated | 155 | 1.000 | 0.729 |
| pixel | combined | automated | 517 | 0.779 | 0.748 |
| pixel | combined | needs-review | 1747 | 0.762 | 0.625 |
