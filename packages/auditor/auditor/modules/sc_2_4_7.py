from __future__ import annotations

from auditor.modules import reasons
from auditor.modules.color import score_from_margin
from auditor.modules.context import ModuleContext
from auditor.modules.focus_common import analyse, document_box, entirely_covered
from auditor.schema import Finding

SC = "2.4.7"
GUIDANCE_KEY = "2.4.7/focus-visible"


def run(ctx: ModuleContext) -> list[Finding]:
    """A stop fails when focusing it changes nothing visible: the strongest state contrast of the
    added pixels is below the R1 visibility ratio (no changed pixels at all counts as invisible).
    Stops that an overlay entirely covers are not assessable (R6) and yield no finding."""
    threshold = ctx.protocol.thresholds.focus.visibility_ratio
    findings: list[Finding] = []
    for step in ctx.capture.focus_steps:
        diff = analyse(ctx, step)
        if diff is None or entirely_covered(ctx, step):
            continue
        strongest = diff.max_contrast()
        median = None if diff.median_contrast() is None else round(diff.median_contrast() or 0.0, 2)
        if strongest is not None and strongest >= threshold:
            continue
        findings.append(
            Finding(
                sc=SC,
                bbox=document_box(step),
                focus_index=step.index,
                severity="serious",
                tier="needs-review" if diff.unsettled else "automated",
                score=score_from_margin(strongest if strongest is not None else 1.0, threshold),
                provenance="pixel",
                evidence={
                    "state_contrast_max": None if strongest is None else round(strongest, 2),
                    "state_contrast_median": median,
                    "threshold": threshold,
                    "changed_px": diff.changed_px,
                    "added_px": diff.added_px,
                    "png_scale": diff.scale,
                    "unsettled": diff.unsettled,
                    **({reasons.KEY: reasons.FOCUS_UNSETTLED} if diff.unsettled else {}),
                    "rule": "R1",
                    "selector": step.selector,
                    "method": "focus-pair-diff",
                },
                guidance_key=GUIDANCE_KEY,
            )
        )
    return findings
