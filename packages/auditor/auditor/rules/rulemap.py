from __future__ import annotations

from typing import Any

from auditor.schema import BBox, Finding

RULE_TO_SC = {"color-contrast": "1.4.3", "target-size": "2.5.8"}
COVERED_SCS = sorted(set(RULE_TO_SC.values()))
GUIDANCE_KEYS = {"1.4.3": "1.4.3/contrast", "2.5.8": "2.5.8/target-size"}
_IMPACT_TO_SEVERITY = {"critical": "critical", "serious": "serious"}
KIND_TIER = {"violation": "automated", "needs-review": "needs-review"}
KIND_SCORE = {"violation": 1.0, "needs-review": 0.5}


def to_findings(raw_findings: list[dict[str, Any]]) -> tuple[list[Finding], int]:
    """Raw axe findings (baseline shape) -> schema findings; boxless nodes are counted, not kept."""
    out: list[Finding] = []
    skipped = 0
    for raw in raw_findings:
        box = raw.get("bbox")
        if not box:
            skipped += 1
            continue
        out.append(
            Finding(
                sc=raw["sc"],
                bbox=BBox(x=box["x"], y=box["y"], w=box["w"], h=box["h"]),
                severity=_IMPACT_TO_SEVERITY.get(raw.get("impact") or "", "minor"),
                tier=KIND_TIER[raw["kind"]],
                score=KIND_SCORE[raw["kind"]],
                provenance="rule",
                evidence={
                    "rule": raw["rule"],
                    "impact": raw.get("impact"),
                    "target": raw["target"],
                    "summary": raw.get("summary", ""),
                    "kind": raw["kind"],
                },
                guidance_key=GUIDANCE_KEYS[raw["sc"]],
            )
        )
    return out, skipped
