# Failed attempts

Every approach that was tried and rejected, with the fixture or measurement that killed it. This feeds Chapter 4. Format: date, milestone, what was tried, why it failed, what replaced it.

- **2026-10-10, M3.** Re-render the saved `dom.html` offline (network blocked) as the element source for real pages. Killed by: 0 of 15 focus rects matched a DOM box on both real fixtures (`real_com_003_desktop`, `real_com_011_mobile`); external CSS is not available offline. Replaced by ADR-012 (capture-time geometry for new captures, pixel element source for the benchmark's real pages).
- **2026-10-10, M3.** Allow the network so `<base href>` loads the live stylesheet. Killed by: still 0 of 15 matched; the sites have drifted since capture. Same replacement.
- **2026-10-10, M3.** Match synthetic 1.4.3 findings to truth by IoU >= 0.3 alone. Killed by: truth is the whole text block (640x60) and the DOM text line is 437x16, IoU 0.18. Replaced by ADR-013 (IoU or containment, duplicates merged).
- **2026-10-10, M2.** Greedy best-match assignment of each finding to a single truth box. Killed by (review): a finding covering two truth boxes left one as a spurious FN, and `correct` disagreed with the TP/FP/FN counts on pages with only wrong-location findings. Replaced by multi-credit matching (a truth box is found if any finding matches it) and `correct = fp == 0 and fn == 0` for page units.
- **2026-10-10, M4.** Give 1.4.11 findings a `minor` band by reusing the large-text 2.7:1 cutoff. Killed by (protocol review): Protocol v1.1 defines no narrow band for non-text contrast. Replaced by always `serious` (ADR-016).
- **2026-10-10, M4.** Evaluate icon-only controls as automated 1.4.11 findings. Rejected before release: the pixel estimate of an icon stroke is lighter than its colour, so the tier is `needs-review` (ADR-016).
- **2026-10-10, M5.** Visibility by the median state contrast of added pixels. Killed by (design review of the real-stratum 2.4.7 false positives): a large faint fill change masked a crisp border. Replaced by the plan's maximum.
- **2026-10-10, M5.** Page background for the added-pixel mask taken as the most common colour of the whole crop. Killed by the synthetic 2.4.7 corpus (8 false positives): a big blue button made blue the "background", so a blue ring on white looked removed. Replaced by the pad frame around the element.
- **2026-10-10, M5.** R5 ring completeness judged over every column of a side. Killed by the synthetic 2.4.13 corpus (8 false positives): rounded corners (radius 6 + offset 2) shortened the ring. Replaced by the central half of each side.
- **2026-10-10, M5.** Treating a stop inside a fixed header as covered by that header. Killed by review: every link in a sticky nav fired 2.4.11/2.4.12. Replaced by `contains_refs`.
- **2026-10-10, M6.** Fusion as connected components over all same-criterion findings (IoU or containment either way). Killed by the sealed benchmark: nested axe elements chained into one finding and hybrid real-stratum 1.4.3 TP fell below rule-only (621 vs 653; delta-precision CI [-0.049, -0.014], nearly outside the -0.05 margin). Replaced by rule-element-centred fusion (ADR-021).

## M7a: shadcn CLI imports `cn` from an unvetted npm package (2026-10-10)
`pnpm dlx shadcn@latest add progress radio-group alert label` generated `import { cn } from "cn"` and added the `cn` package. Replaced with the owned `@/lib/utils` helper and removed the dependency. Check generated imports after every `shadcn add`.

## M7a: Next rewrites for the API proxy (2026-10-10)
`rewrites()` are evaluated at build time, so the API address could not be chosen when starting the e2e servers. Replaced by a runtime route handler (ADR-023).

## M2/M6: McNemar paired by list position (2026-10-10)
`run_mcnemar(results, conditions[0], conditions[1], ...)` compared whichever two conditions were listed first. With `rule_only,pixel,hybrid` it compared rule-only with the pixel condition, so the recorded McNemar results were not the hybrid-versus-rule-only test the plan specifies. It went unnoticed because the M2 test listed `hybrid,rule_only` and the bootstrap picks its pair by name. Replaced by `mcnemar_pair()` (by name) and a test over the possible orders; the evaluation was rerun.

## M8: stability check with a second sync Playwright (2026-10-10)
The first `auditor stability` run failed all ten pages because the capture driver started its own `sync_playwright()` and the axe runner started another in the same thread. The capture driver now uses the shared reference-counted driver (the fix already applied to the rule runner and DOM source in M6).

- **2026-10-10, M10.** An 8x8 (64-bit) difference hash with a 10-bit leak tolerance against the benchmark pages. Killed by the data: it rejected 39 of 327 candidate rows (12 %), mostly plain white pages that collide in a weak hash. Replaced by a 256-bit hash (leak <= 16, near-duplicate <= 8; ADR-020).
- **2026-10-10, M10.** First smoke run without the training extras. It failed with "RF-DETR training dependencies are missing" and the decision logic called that a fallback verdict. Fixed: `rfdetr[train,loggers]` is now in the `ml` extra and a missing dependency is reported as `dependency-missing`, not as a verdict on RF-DETR.
- **2026-10-10, M10.** ONNX export at the planned 560 px. RF-DETR requires a multiple of 32; replaced by 576 (ADR-019).
- **2026-10-10, M10.** Reading the last six detector logit columns. Verified against `predict()` on the smoke checkpoint: the 7-column `labels` output has the classes in the first six columns and an extra last column; fixed.
- **2026-10-10, M10.** A pure-Python quadratic duplicate check over all kept hashes (killed after 15 minutes at 8,431 of 15,000 images). Replaced by a vectorised uint64 popcount index; the full preparation then took about 8 minutes.
