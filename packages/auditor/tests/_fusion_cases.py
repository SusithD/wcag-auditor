from __future__ import annotations

from typing import Any

from auditor.schema import BBox, Finding


def finding(
    sc: str,
    box: tuple[float, float, float, float] | None,
    severity: str,
    tier: str,
    provenance: str,
    score: float = 0.9,
    focus: int | None = None,
    evidence: dict[str, Any] | None = None,
    key: str = "k",
) -> Finding:
    return Finding(
        sc=sc,
        bbox=None if box is None else BBox(x=box[0], y=box[1], w=box[2], h=box[3]),
        focus_index=focus,
        severity=severity,
        tier=tier,
        score=score,
        provenance=provenance,
        evidence=evidence or {},
        guidance_key=key,
    )


def hand_built() -> list[Finding]:
    contrast = "1.4.3/contrast"
    size = "2.5.8/target-size"
    return [
        finding(
            "1.4.3",
            (100, 100, 200, 20),
            "serious",
            "automated",
            "rule",
            1.0,
            evidence={"rule": "color-contrast"},
            key=contrast,
        ),
        finding(
            "1.4.3",
            (100, 100, 200, 18),
            "minor",
            "needs-review",
            "pixel",
            0.7,
            evidence={"ratio": 4.4},
            key=contrast,
        ),
        finding(
            "1.4.3",
            (110, 102, 60, 14),
            "minor",
            "needs-review",
            "pixel",
            0.6,
            evidence={"ratio": 4.3},
            key=contrast,
        ),
        finding(
            "1.4.3",
            (400, 300, 50, 20),
            "minor",
            "automated",
            "pixel",
            0.8,
            evidence={"ratio": 4.2},
            key=contrast,
        ),
        finding(
            "2.5.8",
            (10, 10, 18, 18),
            "serious",
            "automated",
            "rule",
            1.0,
            evidence={"rule": "target-size"},
            key=size,
        ),
        finding(
            "2.5.8",
            (10, 10, 18, 18),
            "serious",
            "needs-review",
            "pixel",
            0.6,
            evidence={"size_px": {"w": 18, "h": 18}},
            key=size,
        ),
        finding(
            "2.4.7",
            None,
            "serious",
            "automated",
            "pixel",
            0.9,
            focus=3,
            evidence={"state_contrast_max": 1.2},
            key="2.4.7/focus-visible",
        ),
        finding(
            "2.4.7",
            None,
            "serious",
            "needs-review",
            "pixel",
            0.5,
            focus=3,
            evidence={"state_contrast_max": 1.3},
            key="2.4.7/focus-visible",
        ),
    ]
