# Re-capture stability

Run 2026-10-10T12:02:19+00:00 against live pages: this artefact is not reproducible byte for byte.

Sample of 10 real desktop pages (seed 20261004); 10 re-captured and compared, 0 failed.
Agreement is the Dice coefficient of one-to-one matched findings (page criteria by IoU or containment, focus criteria by stop index).

| SC | benchmark | re-capture | matched | Dice |
|---|---|---|---|---|
| 1.4.11 | 0 | 3 | 0 | 0.000 |
| 1.4.3 | 102 | 91 | 73 | 0.756 |
| 2.4.11 | 14 | 0 | 0 | 0.000 |
| 2.4.13 | 18 | 18 | 18 | 1.000 |
| 2.4.7 | 15 | 15 | 15 | 1.000 |
| 2.5.8 | 6 | 7 | 6 | 0.923 |

Overall Dice: 0.775
