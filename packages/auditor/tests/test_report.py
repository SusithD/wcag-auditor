import json
import re
from pathlib import Path

import pytest
from _fusion_cases import finding, hand_built
from auditor.fusion import fuse
from auditor.fusion.coverage import Inputs, build_coverage, pixel_verdicts, rule_verdicts
from auditor.report import build, guidance
from auditor.report.render import GLYPH, render
from auditor.schema import Capture, Finding, Run
from PIL import Image

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
SRC = Path(__file__).resolve().parents[1] / "auditor"


def capture() -> Capture:
    return Capture.from_folder(next(FIXTURES.glob("synth/sc2-4-13/*_091_*")))


def make_run(findings: list[Finding], condition: str = "hybrid") -> Run:
    cap = capture()
    inputs = Inputs("dom", True, False, True, len(cap.focus_steps))
    return Run(
        id="r1",
        created_at="2026-10-10T00:00:00Z",
        source_kind="folder",
        source=str(cap.path),
        viewports=["desktop"],
        condition=condition,
        status="done",
        versions={"chromium": "chromium 153", "playwright": "1.63.0"},
        protocol_sha="p" * 64,
        findings=fuse(findings),
        coverage=build_coverage(cap, condition, inputs, True),
    )


def test_rule_only_coverage_reports_two_reliable_criteria() -> None:
    cov = build_coverage(capture(), "rule_only", None, True)
    run = make_run([], "rule_only").model_copy(update={"coverage": cov})
    assert build.reliable_counts(run)["hybrid"] == {"automated": 2, "any": 2}
    assert {c.sc for c in cov.cells if c.rule_verdict == "automated"} == {"1.4.3", "2.5.8"}
    assert all(c.pixel_verdict == "none" for c in cov.cells)


def test_hybrid_with_dom_geometry_and_focus_stops_covers_all_eight() -> None:
    inputs = Inputs("dom", True, False, True, 4)
    assert set(pixel_verdicts(inputs).values()) == {"automated"}


def test_hybrid_without_geometry_degrades_by_input() -> None:
    ocr_only = pixel_verdicts(Inputs("pixel", False, False, False, 5))
    assert ocr_only["1.4.3"] == "needs-review" and ocr_only["2.4.11"] == "needs-review"
    assert ocr_only["2.4.7"] == ocr_only["2.4.13"] == "automated"
    assert (
        ocr_only["1.4.11"]
        == ocr_only["2.5.8"]
        == ocr_only["2.5.7"]
        == ocr_only["2.4.12"]
        == "not-assessable"
    )
    with_detector = pixel_verdicts(Inputs("pixel", False, True, False, 5))
    assert with_detector["1.4.11"] == with_detector["2.5.8"] == "needs-review"
    no_stops = pixel_verdicts(Inputs("dom", True, False, True, 0))
    assert no_stops["2.4.7"] == "not-assessable" and no_stops["1.4.11"] == "automated"


def test_rule_verdicts_cover_only_axe_criteria() -> None:
    assert {sc for sc, v in rule_verdicts(True).items() if v == "automated"} == {"1.4.3", "2.5.8"}
    assert set(rule_verdicts(False).values()) == {"none"}


def test_nearest_passing_colour_is_minimal_and_reaches_the_threshold() -> None:
    from auditor.modules.color import contrast_ratio

    got = guidance.nearest_passing("#777777", "#FFFFFF", 4.5)
    assert got == "#767676"
    rgb = guidance.parse_hex(got or "")
    assert rgb is not None and contrast_ratio(rgb, (255, 255, 255)) >= 4.5
    assert guidance.nearest_passing("#111111", "#FFFFFF", 4.5) == "#111111"
    assert guidance.nearest_passing("#777777", "#808080", 7.0) is None
    assert guidance.nearest_passing("not-a-colour", "#FFFFFF", 4.5) is None
    dark = guidance.nearest_passing("#555555", "#000000", 4.5)
    assert dark is not None and dark > "#555555"


def used_guidance_keys() -> set[str]:
    keys: set[str] = set()
    for path in (SRC / "modules").glob("sc_*.py"):
        keys |= set(re.findall(r'GUIDANCE_KEY(?:S)? = "([^"]+)"', path.read_text()))
    keys |= set(
        re.findall(r'"([0-9.]+/[a-z-]+)"', (SRC / "modules" / "sc_2_4_11_12.py").read_text())
    )
    keys |= set(re.findall(r'"([0-9.]+/[a-z-]+)"', (SRC / "rules" / "rulemap.py").read_text()))
    return keys


def test_every_guidance_key_the_pipeline_can_emit_has_guidance() -> None:
    keys = used_guidance_keys()
    assert len(keys) >= 8 and not keys - set(guidance.load())
    for entry in guidance.load().values():
        assert entry["understanding"].startswith("https://www.w3.org/WAI/WCAG22/Understanding/")
        assert entry["techniques"] and all(
            t["url"].startswith("https://www.w3.org/") for t in entry["techniques"]
        )


def test_guidance_fills_evidence_and_leaves_css_braces_alone() -> None:
    f = finding(
        "1.4.3",
        (0, 0, 10, 10),
        "minor",
        "automated",
        "pixel",
        key="1.4.3/contrast",
        evidence={"pixel": {"ratio": 4.47, "threshold": 4.5, "fg": "#777777", "bg": "#FFFFFF"}},
    )
    g = guidance.render(f)
    assert "4.47:1" in g["what_failed"] and "#767676" in g["nearest_passing"]
    assert ".element {" in g["fix_css"] and "color: #767676;" in g["fix_css"]
    assert (
        guidance.render(finding("2.4.7", None, "minor", "automated", "pixel", focus=0, key="nope"))
        == {}
    )


def test_missing_evidence_shows_a_question_mark_not_a_crash() -> None:
    f = finding("2.5.8", (0, 0, 18, 18), "serious", "automated", "pixel", key="2.5.8/target-size")
    text = guidance.render(f)["what_failed"]
    assert "18 x 18" in text and "at least ? x ?" in text


def test_report_json_extends_the_run_and_still_validates_as_one(tmp_path: Path) -> None:
    run = make_run(hand_built())
    report = build.build(run, capture(), tmp_path)
    assert Run.model_validate_json((tmp_path / "report.json").read_text()).id == "r1"
    assert report["summary"]["total"] == len(run.findings)
    assert set(report["guidance"]) == {f.id for f in run.findings}
    assert report["page"]["viewport"] == "desktop" and report["page"]["screenshot"]["width"] > 0
    assert report["reliable"]["hybrid"]["automated"] == 8


def test_crops_exist_for_page_and_focus_findings_and_are_bounded(tmp_path: Path) -> None:
    cap = capture()
    page = finding(
        "1.4.3", (160, 260, 220, 48), "serious", "automated", "pixel", key="1.4.3/contrast"
    )
    focus = finding(
        "2.4.13", None, "minor", "automated", "pixel", focus=0, key="2.4.13/focus-appearance"
    )
    run = make_run([page, focus])
    report = build.build(run, cap, tmp_path)
    assert len(report["crops"]) == 2
    for name in report["crops"].values():
        with Image.open(tmp_path / name) as image:
            assert 0 < image.width <= build.CROP_MAX_WIDTH
    focus_id = next(f.id for f in run.findings if f.focus_index == 0)
    with Image.open(tmp_path / report["crops"][focus_id]) as image:
        assert image.width > 200


def test_evidence_rows_show_measured_against_required() -> None:
    f = finding(
        "2.5.8",
        (0, 0, 18, 18),
        "serious",
        "automated",
        "both",
        key="2.5.8/target-size",
        evidence={
            "pixel": {"size_px": {"w": 18, "h": 18}, "threshold": 24},
            "rule": {"rule": "target-size", "impact": "serious"},
        },
    )
    rows = dict(build.evidence_rows(f))
    assert rows["Measured size"] == "18 x 18 px" and rows["Required size"] == "24 x 24 px"
    assert rows["axe rule"] == "target-size"


def html_for(findings: list[Finding], tmp_path: Path) -> str:
    run = make_run(findings)
    report = build.build(run, capture(), tmp_path)
    return render(report, tmp_path, capture().path / "screenshot.png")


def test_html_is_self_contained_and_structured(tmp_path: Path) -> None:
    page = finding(
        "1.4.3",
        (160, 260, 220, 48),
        "serious",
        "automated",
        "both",
        key="1.4.3/contrast",
        evidence={"pixel": {"ratio": 4.1, "threshold": 4.5, "fg": "#888888", "bg": "#FFFFFF"}},
    )
    html = html_for([page], tmp_path)
    assert html.startswith("<!doctype html>") and '<html lang="en">' in html
    assert "<script" not in html and 'src="http' not in html and "<link" not in html
    for landmark in ("<header>", '<main id="main" tabindex="-1">', "<footer>", 'class="skip"'):
        assert landmark in html
    assert html.count("<h1") == 1 and "<caption>" in html and 'scope="row"' in html
    assert GLYPH["serious"] in html and "Serious" in html
    assert "alt=" in html and html.count("<img") == html.count("alt=")
    assert 'tabindex="0"' in html


def test_every_severity_has_a_glyph_and_a_label_not_colour_alone(tmp_path: Path) -> None:
    items = [
        finding("1.4.3", (10, 10, 50, 20), "critical", "automated", "pixel", key="1.4.3/contrast"),
        finding(
            "1.4.11",
            (10, 100, 50, 20),
            "serious",
            "automated",
            "pixel",
            key="1.4.11/non-text-contrast",
        ),
        finding(
            "2.5.8", (10, 200, 18, 18), "minor", "needs-review", "pixel", key="2.5.8/target-size"
        ),
    ]
    html = html_for(items, tmp_path)
    for label in ("Critical", "Needs review"):
        assert label in html
    assert GLYPH["critical"] in html and GLYPH["needs-review"] in html


def test_html_escapes_untrusted_text(tmp_path: Path) -> None:
    cap = capture()
    meta = dict(cap.meta, url="http://x.test/?q=<script>alert(1)</script>", final_url=None)
    hostile = cap.model_copy(update={"meta": meta})
    run = make_run([])
    report = build.build(run, hostile, tmp_path)
    html = render(report, tmp_path, cap.path / "screenshot.png")
    assert "<script>alert(1)</script>" not in html and "&lt;script&gt;" in html


def test_a_report_without_findings_says_so(tmp_path: Path) -> None:
    html = html_for([], tmp_path)
    assert "No violations were reported" in html and "0 findings" in html


def test_report_json_is_valid_json_with_the_documented_keys(tmp_path: Path) -> None:
    run = make_run(hand_built())
    build.build(run, capture(), tmp_path)
    data = json.loads((tmp_path / "report.json").read_text())
    assert {
        "page",
        "summary",
        "reliable",
        "guidance",
        "evidence_rows",
        "crops",
        "findings",
        "coverage",
    } <= set(data)


@pytest.mark.parametrize("condition", ["hybrid", "rule_only"])
def test_html_renders_for_both_conditions(condition: str, tmp_path: Path) -> None:
    run = make_run([], condition)
    report = build.build(run, capture(), tmp_path)
    assert condition.replace("_", "-") in render(
        report, tmp_path, capture().path / "screenshot.png"
    )


def test_a_crop_box_fully_outside_the_screenshot_gives_no_crop() -> None:
    from auditor.schema import BBox

    shot = Image.new("RGB", (100, 100))
    assert build.page_crop(shot, BBox(x=500, y=500, w=10, h=10)) is None
    assert build.page_crop(shot, BBox(x=10, y=10, w=10, h=10)) is not None


def test_rule_only_findings_get_measured_values_from_the_axe_summary() -> None:
    summary = (
        "Element has insufficient color contrast of 2.85 (foreground color: #999999, "
        "background color: #ffffff, font size: 12.0pt). Expected contrast ratio of 4.5:1"
    )
    rule = finding(
        "1.4.3", (10, 10, 100, 20), "serious", "automated", "rule", 1.0, key="1.4.3/contrast"
    ).model_copy(update={"evidence": {"rule": {"summary": summary}}})
    rows = dict(build.evidence_rows(rule))
    assert rows["Measured contrast"] == "2.85:1" and rows["Required contrast"] == "4.5:1"
    assert guidance.render(rule)["fix_css"]


def test_hostile_evidence_text_cannot_inject_template_placeholders(tmp_path: Path) -> None:
    cap = capture()
    meta = dict(cap.meta, url="http://x.test/$summary$findings", final_url=None)
    report = build.build(make_run([]), cap.model_copy(update={"meta": meta}), tmp_path)
    html = render(report, tmp_path, cap.path / "screenshot.png")
    assert "http://x.test/$summary$findings" in html
