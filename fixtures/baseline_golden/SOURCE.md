Source: `../04_Data_Collection/baseline_runs/20261010T064722Z_snapshot` (run_baseline.py 1.0.0, snapshot mode, axe-core 4.13.0, chromium 153.0.8010.12, errors=0). Each file is that run's `baseline_findings.json` for the fixture folder of the same name, copied unmodified. `auditor run --condition rule_only` must reproduce them byte for byte (`rule_findings.json`).

The ground truth (`benchmark_ground_truth.json`, sha256 b859a6de35fbad9bb00c1480efffcba442584cb820e468df1babd53d39718e20) was sealed after this baseline ran; the baseline never saw it.

sha256 of each copied file:

```
d110b0aab03ebcc345fd569873dae589e970bb90c6bd5a65dcb3b383d7ac39cb real_com_003_desktop_20261004T054402Z.json
a2e4c670b3ececd2c26c5a1663114bb4f1e7653647ebd362b4eb29e600f9525a real_com_011_mobile_20261004T054738Z.json
099c62d63eeca656bb199d10b7c3f819bb56097028189f7528dc49e075841ada synth_sc1-4-3_001_desktop_20261004T060449Z.json
8a720d9c452500abff5ea102081c6b0fafd45e9607044096ed5d0a7cb2c66bc2 synth_sc2-4-13_091_desktop_20261004T061309Z.json
809e371872f11fef95cbd19fb651f0e303add5d53a94fca8a922a3230266989f synth_sc2-5-8_126_desktop_20261004T061625Z.json
```
