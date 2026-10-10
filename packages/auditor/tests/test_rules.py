import hashlib
import json
import os
from pathlib import Path
from typing import Any

import pytest
from auditor import pipeline
from auditor.rules.axe import AXE_PATH, to_raw_findings
from auditor.rules.rulemap import COVERED_SCS, RULE_TO_SC, to_findings
from auditor.schema import Run

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "fixtures"
GOLDEN = FIXTURES / "baseline_golden"
BENCH_AXE = REPO.parent / "04_Data_Collection" / "vendor" / "axe.min.js"
FOLDERS = sorted(
    p.parent
    for p in FIXTURES.glob("**/meta.json")
    if "golden" not in p.parts and "sites" not in p.parts
)


def test_vendored_axe_matches_the_benchmark_copy() -> None:
    if not BENCH_AXE.exists():
        if os.environ.get("REQUIRE_BENCHMARK") == "1":
            pytest.fail("benchmark axe.min.js not available")
        pytest.skip("benchmark axe.min.js not available")
    assert (
        hashlib.sha256(AXE_PATH.read_bytes()).hexdigest()
        == hashlib.sha256(BENCH_AXE.read_bytes()).hexdigest()
    )


def test_vendored_axe_is_4_13_0_by_recorded_hash() -> None:
    assert (
        hashlib.sha256(AXE_PATH.read_bytes()).hexdigest()
        == "c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1"
    )


def test_rule_map_covers_only_contrast_and_target_size() -> None:
    assert RULE_TO_SC == {"color-contrast": "1.4.3", "target-size": "2.5.8"}
    assert COVERED_SCS == ["1.4.3", "2.5.8"]


def test_raw_findings_mapping_matches_the_baseline_selftest() -> None:
    fake = {
        "violations": [
            {
                "id": "color-contrast",
                "impact": "serious",
                "nodes": [{"target": ["p.a"], "failureSummary": "x"}],
            },
            {"id": "image-alt", "nodes": [{"target": ["img"]}]},
        ],
        "incomplete": [
            {"id": "target-size", "nodes": [{"target": ["#f", "button"], "impact": "serious"}]}
        ],
    }
    raw = to_raw_findings(fake, lambda ts: [{"x": 1, "y": 2, "w": 3, "h": 4} for _ in ts])
    assert [(f["sc"], f["kind"]) for f in raw] == [
        ("1.4.3", "violation"),
        ("2.5.8", "needs-review"),
    ]
    assert raw[0]["bbox"] == {"x": 1, "y": 2, "w": 3, "h": 4} and raw[0]["impact"] == "serious"


def test_schema_mapping_tiers_severity_and_boxless_nodes() -> None:
    raw: list[dict[str, Any]] = [
        {
            "sc": "1.4.3",
            "rule": "color-contrast",
            "kind": "violation",
            "impact": "critical",
            "bbox": {"x": 0, "y": 0, "w": 5, "h": 5},
            "target": ["a"],
            "summary": "",
        },
        {
            "sc": "2.5.8",
            "rule": "target-size",
            "kind": "needs-review",
            "impact": None,
            "bbox": {"x": 0, "y": 0, "w": 5, "h": 5},
            "target": ["b"],
            "summary": "",
        },
        {
            "sc": "1.4.3",
            "rule": "color-contrast",
            "kind": "violation",
            "impact": "serious",
            "bbox": None,
            "target": ["c"],
            "summary": "",
        },
    ]
    findings, boxless = to_findings(raw)
    assert boxless == 1 and len(findings) == 2
    assert (findings[0].severity, findings[0].tier, findings[0].provenance) == (
        "critical",
        "automated",
        "rule",
    )
    assert (findings[1].severity, findings[1].tier) == ("minor", "needs-review")


@pytest.mark.browser
@pytest.mark.parametrize("folder", FOLDERS, ids=lambda p: p.name[:32])
def test_rule_only_run_is_byte_equal_to_the_baseline_golden(folder: Path, tmp_path: Path) -> None:
    run = pipeline.run_folder(folder, tmp_path, condition="rule_only")
    got = (tmp_path / "rule_findings.json").read_text()
    assert got == (GOLDEN / f"{folder.name}.json").read_text()
    report = Run.model_validate_json((tmp_path / "report.json").read_text())
    assert report.condition == "rule_only" and report.stage_status["rules"] == "done"
    raw = json.loads(got)["findings"]
    boxed = [f for f in raw if f["bbox"]]
    assert [f.bbox.model_dump() if f.bbox else None for f in report.findings] == [
        f["bbox"] for f in boxed
    ]
    assert len(run.findings) + int(report.stage_status["rules_boxless_nodes"]) == len(raw)
    verdicts = {c.sc: c.rule_verdict for c in report.coverage.cells}
    assert verdicts["1.4.3"] == verdicts["2.5.8"] == "automated"
    assert {v for sc, v in verdicts.items() if sc not in COVERED_SCS} == {"none"}


def test_baseline_golden_files_match_their_recorded_sha256() -> None:
    recorded = dict(
        line.split()[::-1]
        for line in (GOLDEN / "SOURCE.md").read_text().splitlines()
        if line.endswith(".json") and len(line.split()) == 2
    )
    assert len(recorded) == 12
    for name, digest in recorded.items():
        assert hashlib.sha256((GOLDEN / name).read_bytes()).hexdigest() == digest
