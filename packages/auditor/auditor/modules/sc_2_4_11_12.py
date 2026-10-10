from __future__ import annotations

from auditor.modules.context import ModuleContext
from auditor.modules.focus_common import analyse, coverage_fraction, document_box
from auditor.schema import Finding

GUIDANCE_KEYS = {
    "2.4.11": "2.4.11/focus-not-obscured-min",
    "2.4.12": "2.4.12/focus-not-obscured-enh",
}


def _finding(
    ctx: ModuleContext,
    sc: str,
    index: int,
    fraction: float | None,
    tier: str,
    method: str,
) -> Finding:
    step = next(s for s in ctx.capture.focus_steps if s.index == index)
    return Finding(
        sc=sc,
        bbox=document_box(step),
        focus_index=index,
        severity="serious",
        tier=tier,
        score=1.0 if tier == "automated" else 0.5,
        provenance="pixel",
        evidence={
            "covered_fraction": fraction,
            "method": method,
            "rule": "R6",
            "selector": step.selector,
        },
        guidance_key=GUIDANCE_KEYS[sc],
    )


def _run(ctx: ModuleContext, sc: str) -> list[Finding]:
    findings: list[Finding] = []
    for step in ctx.capture.focus_steps:
        fraction = coverage_fraction(ctx, step)
        if fraction is not None:
            entire = fraction >= 1.0
            if entire:
                diff = analyse(ctx, step)
                entire = diff is None or diff.changed_inside_rect() == 0
            hit = entire if sc == "2.4.11" else (entire or 0.0 < fraction < 1.0)
            if hit:
                findings.append(
                    _finding(ctx, sc, step.index, fraction, "automated", "fixed-region-hit-test")
                )
            continue
        diff = analyse(ctx, step)
        if diff is not None and diff.changed_inside_rect() == 0 and sc == "2.4.11":
            findings.append(_finding(ctx, sc, step.index, None, "needs-review", "no-pixel-change"))
    return findings


def run_min(ctx: ModuleContext) -> list[Finding]:
    """2.4.11: the focused element is entirely covered by opaque author content (R6)."""
    return _run(ctx, "2.4.11")


def run_enh(ctx: ModuleContext) -> list[Finding]:
    """2.4.12: any part of the focused element is covered (entire coverage implies it)."""
    return _run(ctx, "2.4.12")
