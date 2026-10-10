import json
from pathlib import Path

import pytest
from auditor import pipeline, protocol
from auditor.cli import app
from auditor.schema import Run
from typer.testing import CliRunner

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
FOLDERS = sorted(p.parent for p in FIXTURES.glob("**/meta.json"))


def test_fixture_set_is_complete() -> None:
    assert len(FOLDERS) == 5


@pytest.mark.parametrize("folder", FOLDERS, ids=lambda p: p.name)
def test_run_folder_writes_valid_report(folder: Path, tmp_path: Path) -> None:
    pipeline.run_folder(folder, tmp_path)
    run = Run.model_validate_json((tmp_path / "report.json").read_text())
    assert len(run.coverage.cells) == len(protocol.load().scs)
    assert {c.hybrid_verdict for c in run.coverage.cells} == {"not-assessable"}
    versions = json.loads((tmp_path / "VERSIONS.json").read_text())
    assert set(versions) == {
        "chromium",
        "playwright",
        "axe",
        "model_sha",
        "protocol_sha",
        "git_sha",
    }
    assert versions["playwright"] == "1.63.0"
    assert versions["axe"] == "c24f097bd2f451d4f933e8bc7d8d539f8672a2ebcb5cc9f9f3eec8ca9470a0c1"


def test_cli_run_ok_and_bad_folder(tmp_path: Path) -> None:
    runner = CliRunner()
    ok = runner.invoke(app, ["run", "--folder", str(FOLDERS[0]), "--out", str(tmp_path / "o")])
    assert ok.exit_code == 0
    assert (tmp_path / "o" / "report.json").is_file()
    bad = runner.invoke(app, ["run", "--folder", str(tmp_path), "--out", str(tmp_path / "x")])
    assert bad.exit_code == 1
