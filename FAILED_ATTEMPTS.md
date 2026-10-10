# Failed attempts

Every approach that was tried and rejected, with the fixture or measurement that killed it. This feeds Chapter 4. Format: date, milestone, what was tried, why it failed, what replaced it.

- **2026-10-10, M3.** Re-render the saved `dom.html` offline (network blocked) as the element source for real pages. Killed by: 0 of 15 focus rects matched a DOM box on both real fixtures (`real_com_003_desktop`, `real_com_011_mobile`); external CSS is not available offline. Replaced by ADR-012 (capture-time geometry for new captures, pixel element source for the benchmark's real pages).
- **2026-10-10, M3.** Allow the network so `<base href>` loads the live stylesheet. Killed by: still 0 of 15 matched; the sites have drifted since capture. Same replacement.
- **2026-10-10, M3.** Match synthetic 1.4.3 findings to truth by IoU >= 0.3 alone. Killed by: truth is the whole text block (640x60) and the DOM text line is 437x16, IoU 0.18. Replaced by ADR-013 (IoU or containment, duplicates merged).
- **2026-10-10, M2.** Greedy best-match assignment of each finding to a single truth box. Killed by (review): a finding covering two truth boxes left one as a spurious FN, and `correct` disagreed with the TP/FP/FN counts on pages with only wrong-location findings. Replaced by multi-credit matching (a truth box is found if any finding matches it) and `correct = fp == 0 and fn == 0` for page units.
- **2026-10-10, M4.** Give 1.4.11 findings a `minor` band by reusing the large-text 2.7:1 cutoff. Killed by (protocol review): Protocol v1.1 defines no narrow band for non-text contrast. Replaced by always `serious` (ADR-016).
- **2026-10-10, M4.** Evaluate icon-only controls as automated 1.4.11 findings. Rejected before release: the pixel estimate of an icon stroke is lighter than its colour, so the tier is `needs-review` (ADR-016).
