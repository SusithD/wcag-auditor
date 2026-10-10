from __future__ import annotations

from collections.abc import Iterable

from auditor.schema import Finding

TIER_ORDER = {"automated": 0, "needs-review": 1, "not-assessable": 2}
SEVERITY_ORDER = {"critical": 0, "serious": 1, "minor": 2}
VERDICT_ORDER = {"automated": 0, "needs-review": 1, "not-assessable": 2, "none": 3}


def best_tier(tiers: Iterable[str]) -> str:
    """The most decisive tier among the members (automated beats needs-review)."""
    return min(tiers, key=lambda t: TIER_ORDER[t])


def worst_severity(severities: Iterable[str]) -> str:
    return min(severities, key=lambda s: SEVERITY_ORDER[s])


def best_verdict(verdicts: Iterable[str]) -> str:
    return min(verdicts, key=lambda v: VERDICT_ORDER[v])


def apply_policy(findings: list[Finding], include_needs_review: bool = False) -> list[Finding]:
    """ADR-014: automated findings only unless the needs-review variant is requested."""
    keep = {"automated", "needs-review"} if include_needs_review else {"automated"}
    return [f for f in findings if f.tier in keep]
