import json
from pathlib import Path

import pytest
from _fusion_cases import finding, hand_built
from auditor.fusion import apply_policy, best_tier, fuse
from auditor.fusion.tiers import best_verdict, worst_severity

GOLDEN = Path(__file__).resolve().parents[3] / "fixtures" / "golden" / "fusion" / "hand_built.json"
CONTRAST = "1.4.3/contrast"


def test_hand_built_case_matches_the_golden() -> None:
    fused = fuse(hand_built())
    got = [json.loads(f.model_dump_json()) for f in fused]
    assert got == json.loads(GOLDEN.read_text())


def test_overlapping_rule_and_pixel_boxes_become_one_finding_with_provenance_both() -> None:
    rule = finding("1.4.3", (100, 100, 200, 20), "serious", "automated", "rule", 1.0, key=CONTRAST)
    pixel = finding(
        "1.4.3", (102, 101, 196, 16), "minor", "needs-review", "pixel", 0.7, key=CONTRAST
    )
    (one,) = fuse([rule, pixel])
    assert one.provenance == "both" and one.id == "f001"
    assert (one.severity, one.tier, one.score) == ("minor", "automated", 1.0)
    assert one.bbox == rule.bbox
    assert one.evidence["members"] == {"rule": 1, "pixel": 1}


def test_several_pixel_lines_inside_one_rule_element_join_it() -> None:
    rule = finding("1.4.3", (0, 0, 400, 100), "serious", "automated", "rule", key=CONTRAST)
    lines = [
        finding("1.4.3", (10, 10 + 25 * i, 300, 18), "minor", "needs-review", "pixel", key=CONTRAST)
        for i in range(3)
    ]
    (one,) = fuse([rule, *lines])
    assert one.evidence["members"] == {"rule": 1, "pixel": 3} and one.provenance == "both"


def test_nested_rule_elements_stay_separate_findings() -> None:
    parent = finding("1.4.3", (0, 0, 400, 100), "serious", "automated", "rule", key=CONTRAST)
    child = finding("1.4.3", (10, 10, 60, 20), "serious", "automated", "rule", key=CONTRAST)
    assert len(fuse([parent, child])) == 2


def test_a_pixel_finding_joins_the_smallest_rule_element_that_contains_it() -> None:
    parent = finding("1.4.3", (0, 0, 400, 100), "serious", "automated", "rule", key=CONTRAST)
    child = finding("1.4.3", (10, 10, 100, 20), "serious", "automated", "rule", key=CONTRAST)
    pixel = finding("1.4.3", (12, 12, 90, 16), "minor", "needs-review", "pixel", key=CONTRAST)
    fused = {f.bbox.w: f for f in fuse([parent, child, pixel]) if f.bbox}
    assert fused[100].provenance == "both" and fused[400].provenance == "rule"


def test_same_channel_duplicates_merge() -> None:
    a = finding("2.5.8", (10, 10, 18, 18), "serious", "automated", "pixel", key="2.5.8/target-size")
    b = finding("2.5.8", (11, 10, 18, 18), "serious", "automated", "pixel", key="2.5.8/target-size")
    assert len(fuse([a, b])) == 1


def test_different_criteria_never_merge_even_with_the_same_box() -> None:
    a = finding("1.4.3", (10, 10, 50, 20), "minor", "automated", "pixel")
    b = finding("1.4.11", (10, 10, 50, 20), "serious", "automated", "pixel")
    assert len(fuse([a, b])) == 2


def test_pixel_only_and_rule_only_findings_keep_their_provenance() -> None:
    rule = finding("1.4.3", (0, 0, 50, 20), "serious", "automated", "rule")
    pixel = finding("1.4.3", (500, 500, 50, 20), "minor", "automated", "pixel")
    assert [f.provenance for f in fuse([rule, pixel])] == ["rule", "pixel"]


def test_focus_findings_merge_per_stop_and_criterion() -> None:
    a = finding("2.4.7", None, "serious", "automated", "pixel", focus=1)
    b = finding("2.4.7", None, "serious", "needs-review", "pixel", focus=1)
    c = finding("2.4.7", None, "serious", "automated", "pixel", focus=2)
    fused = fuse([a, b, c])
    assert [f.focus_index for f in fused] == [1, 2] and fused[0].tier == "automated"


def test_findings_without_a_box_pass_through() -> None:
    nb = finding("2.5.7", None, "critical", "not-assessable", "pixel")
    assert len(fuse([nb])) == 1


def test_output_is_deterministic_and_ordered_by_criterion_then_position() -> None:
    items = hand_built()
    forward, backward = fuse(items), fuse(list(reversed(items)))
    assert [f.model_dump() for f in forward] == [f.model_dump() for f in backward]
    assert [f.sc for f in forward] == sorted(f.sc for f in forward)
    assert [f.id for f in forward] == [f"f{i:03d}" for i in range(1, len(forward) + 1)]


def test_tier_and_severity_helpers() -> None:
    assert best_tier(["needs-review", "automated"]) == "automated"
    assert best_tier(["needs-review", "not-assessable"]) == "needs-review"
    assert worst_severity(["minor", "critical", "serious"]) == "critical"
    assert best_verdict(["none", "needs-review", "automated"]) == "automated"
    assert best_verdict(["none", "not-assessable"]) == "not-assessable"


def test_policy_filters_needs_review_unless_asked() -> None:
    items = fuse(hand_built())
    assert {f.tier for f in apply_policy(items)} == {"automated"}
    assert "needs-review" in {
        f.tier for f in apply_policy(items, include_needs_review=True)
    } or all(f.tier == "automated" for f in items)


@pytest.mark.parametrize("n", [0, 1])
def test_fuse_handles_tiny_inputs(n: int) -> None:
    items = hand_built()[:n]
    assert len(fuse(items)) == n
