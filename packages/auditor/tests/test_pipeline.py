import json
from pathlib import Path

import pytest
from auditor import pipeline, protocol
from auditor.cli import app
from auditor.rules.axe import AXE_PATH
from auditor.schema import Capture, Condition, Run
from typer.testing import CliRunner

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
FOLDERS = sorted(p.parent for p in FIXTURES.glob("**/meta.json") if "golden" not in p.parts)
REAL = sorted(FIXTURES.glob("real/*"))
EXPECTED_VERSIONS = {"chromium", "playwright", "axe", "model_sha", "protocol_sha", "git_sha"}


def test_fixture_set_is_complete() -> None:
    assert len(FOLDERS) == 12


def test_cli_rejects_a_folder_without_meta_json(tmp_path: Path) -> None:
    result = CliRunner().invoke(
        app, ["run", "--folder", str(tmp_path), "--out", str(tmp_path / "x")]
    )
    assert result.exit_code == 1


def test_cli_requires_a_folder() -> None:
    assert CliRunner().invoke(app, ["run"]).exit_code != 0


@pytest.mark.browser
@pytest.mark.parametrize("folder", FOLDERS, ids=lambda p: p.name[:34])
def test_hybrid_run_writes_report_html_pdf_and_versions(folder: Path, tmp_path: Path) -> None:
    run = pipeline.run_folder(folder, tmp_path, "hybrid", pdf=False)
    report = Run.model_validate_json((tmp_path / "report.json").read_text())
    assert report.condition == "hybrid" and len(report.coverage.cells) == len(protocol.load().scs)
    assert (tmp_path / "report.html").read_text().startswith("<!doctype html>")
    assert (tmp_path / "crops").is_dir() and (tmp_path / "rule_findings.json").is_file()
    versions = json.loads((tmp_path / "VERSIONS.json").read_text())
    assert set(versions) == EXPECTED_VERSIONS and versions["playwright"] == "1.63.0"
    assert all(f.id for f in run.findings) and run.stage_status["fusion"] == "done"


@pytest.mark.browser
@pytest.mark.parametrize("folder", REAL, ids=lambda p: p.name[:30])
def test_real_fixtures_both_conditions_produce_json_html_and_pdf(
    folder: Path, tmp_path: Path
) -> None:
    counts = {}
    conditions: tuple[Condition, ...] = ("rule_only", "hybrid")
    for condition in conditions:
        out = tmp_path / condition
        pipeline.run_folder(folder, out, condition)
        data = json.loads((out / "report.json").read_text())
        assert (out / "report.html").is_file()
        assert (out / "report.pdf").read_bytes().startswith(b"%PDF")
        counts[condition] = data["reliable"]
    assert counts["rule_only"]["hybrid"] == {"automated": 2, "any": 2}
    assert counts["hybrid"]["hybrid"] == {"automated": 4, "any": 5}


@pytest.mark.browser
def test_pdf_has_pages_and_report_text_and_a_failed_pdf_does_not_fail_the_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from pypdf import PdfReader

    pipeline.run_folder(REAL[0], tmp_path / "ok", "hybrid")
    reader = PdfReader(tmp_path / "ok" / "report.pdf")
    assert len(reader.pages) >= 1
    assert "WCAG 2.2 audit" in "".join(p.extract_text() for p in reader.pages)
    assert (
        json.loads((tmp_path / "ok" / "report.json").read_text())["stage_status"]["pdf"] == "done"
    )

    def boom(*_: object, **__: object) -> None:
        raise RuntimeError("no chromium")

    monkeypatch.setattr(pipeline, "render_pdf", boom)
    run = pipeline.run_folder(REAL[0], tmp_path / "bad", "hybrid")
    assert run.status == "done" and run.stage_status["pdf"].startswith("failed")
    assert (tmp_path / "bad" / "report.html").is_file() and not (
        tmp_path / "bad" / "report.pdf"
    ).exists()


@pytest.mark.browser
def test_rerunning_into_the_same_folder_removes_stale_outputs(tmp_path: Path) -> None:
    (tmp_path / "crops").mkdir()
    (tmp_path / "crops" / "stale.png").write_bytes(b"x")
    (tmp_path / "report.pdf").write_bytes(b"old")
    pipeline.run_folder(REAL[0], tmp_path, "hybrid", pdf=False)
    assert (
        not (tmp_path / "crops" / "stale.png").exists() and not (tmp_path / "report.pdf").exists()
    )


@pytest.mark.browser
def test_hybrid_covers_all_eight_criteria_on_a_self_contained_page(tmp_path: Path) -> None:
    folder = next(FIXTURES.glob("synth/sc2-5-8/*"))
    pipeline.run_folder(folder, tmp_path, "hybrid", pdf=False)
    data = json.loads((tmp_path / "report.json").read_text())
    assert data["reliable"]["hybrid"]["automated"] == 8
    assert data["reliable"]["rule"]["automated"] == 2


@pytest.mark.browser
def test_hybrid_fuses_the_rule_and_pixel_findings_on_the_target_size_page(tmp_path: Path) -> None:
    folder = next(FIXTURES.glob("synth/sc2-5-8/*"))
    run = pipeline.run_folder(folder, tmp_path, "hybrid", pdf=False)
    size = [f for f in run.findings if f.sc == "2.5.8"]
    assert len(size) == 4 and {f.provenance for f in size} == {"both"}
    rule_only = pipeline.run_folder(folder, tmp_path / "r", "rule_only", pdf=False)
    assert len([f for f in rule_only.findings if f.sc == "2.5.8"]) == 4


@pytest.mark.browser
@pytest.mark.parametrize("scheme", ["light", "dark"])
def test_generated_html_reports_pass_axe_with_zero_violations(scheme: str, tmp_path: Path) -> None:
    from playwright.sync_api import sync_playwright

    pipeline.run_folder(REAL[0], tmp_path / "real", "hybrid", pdf=False)
    pipeline.run_folder(
        next(FIXTURES.glob("synth/sc2-4-13/*_091_*")), tmp_path / "synth", "hybrid", pdf=False
    )
    pipeline.run_folder(
        next(FIXTURES.glob("synth/sc1-4-3/*")), tmp_path / "clean", "rule_only", pdf=False
    )
    axe = AXE_PATH.read_text(encoding="utf-8")
    tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        try:
            for name in ("real", "synth", "clean"):
                page = browser.new_context(color_scheme=scheme).new_page()  # type: ignore[arg-type]
                page.goto((tmp_path / name / "report.html").as_uri())
                page.add_script_tag(content=axe)
                result = page.evaluate(
                    "(t) => axe.run(document, {runOnly: {type: 'tag', values: t}})", tags
                )
                assert result["violations"] == [], (name, [v["id"] for v in result["violations"]])
        finally:
            browser.close()


@pytest.mark.browser
def test_cli_run_writes_the_report(tmp_path: Path) -> None:
    out = tmp_path / "o"
    result = CliRunner().invoke(
        app, ["run", "--folder", str(FOLDERS[0]), "--out", str(out), "--condition", "rule_only"]
    )
    assert result.exit_code == 0 and (out / "report.json").is_file()


@pytest.mark.browser
def test_the_rule_runner_and_the_dom_source_can_be_open_at_the_same_time() -> None:
    from auditor.elements.dom import DomElementSource
    from auditor.rules.axe import AxeRunner

    capture = Capture.from_folder(next(f for f in FOLDERS if f.name.startswith("synth_sc2-5-8")))
    with AxeRunner() as runner, DomElementSource() as dom:
        runner.run(capture)
        dom.dump(capture)
