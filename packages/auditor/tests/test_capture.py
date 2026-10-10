from __future__ import annotations

import functools
import http.server
import json
import os
import subprocess
import sys
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest
from auditor.capture import snapshot_html, step_focus
from auditor.capture.driver import GENERATOR_VERSION

REPO = Path(__file__).resolve().parents[3]
SITES = REPO / "fixtures" / "sites"
VALIDATOR = REPO.parent / "04_Data_Collection" / "validate_captures.py"


def test_step_focus_left_page() -> None:
    infos = iter([{"uid": 1, "tag": "a"}, {"uid": 2, "tag": "button"}, None])
    steps, run = step_focus(lambda: None, lambda: next(infos), lambda k, i: {"file_on": f"{k}"}, 10)
    assert [s["uid"] for s in steps] == [1, 2]
    assert run == {"presses": 3, "stop_reason": "left-page"}


def test_step_focus_cycle() -> None:
    infos = iter([{"uid": 1, "tag": "a"}, {"uid": 2, "tag": "a"}, {"uid": 1, "tag": "a"}])
    steps, run = step_focus(lambda: None, lambda: next(infos), lambda k, i: {}, 10)
    assert len(steps) == 2 and run["stop_reason"] == "cycle"


def test_step_focus_skips_repeated_iframe() -> None:
    frame = {"uid": 1, "tag": "iframe"}
    infos = iter([frame, frame, frame, None])
    steps, run = step_focus(lambda: None, lambda: next(infos), lambda k, i: {}, 10)
    assert len(steps) == 1 and run["stop_reason"] == "left-page"


def test_step_focus_press_budget_and_max_steps() -> None:
    counter = iter(range(1000))
    _, run = step_focus(
        lambda: None, lambda: {"uid": next(counter), "tag": "a"}, lambda k, i: {}, 3
    )
    assert run["stop_reason"] == "max-steps"
    _, run = step_focus(
        lambda: None, lambda: {"uid": 1, "tag": "iframe"}, lambda k, i: {}, 5, max_presses=7
    )
    assert run["stop_reason"] == "press-budget" and run["presses"] == 7


def test_snapshot_strips_scripts_and_adds_base(tmp_path: Path) -> None:
    (tmp_path / "dom.html").write_text(
        "<html><head><title>x</title><script>alert(1)</script></head>"
        "<body><script src=a.js></script>hi</body></html>"
    )
    html = snapshot_html(tmp_path, {"final_url": "https://ex.org/p/"})
    assert "<script" not in html
    assert '<base href="https://ex.org/p/">' in html


def test_snapshot_keeps_existing_base(tmp_path: Path) -> None:
    (tmp_path / "dom.html").write_text('<html><head><base href="/x/"></head></html>')
    assert snapshot_html(tmp_path, {"url": "https://ex.org/"}).count("<base") == 1


@pytest.fixture
def static_server() -> Iterator[str]:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(SITES))
    handler.log_message = lambda *a, **k: None  # type: ignore[attr-defined]
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/static.html"
    finally:
        server.shutdown()
        server.server_close()


def _unavailable(reason: str) -> None:
    if os.environ.get("REQUIRE_BENCHMARK") == "1":
        pytest.fail(reason)
    pytest.skip(reason)


SPECS = {"desktop": (1440, 900, False), "mobile": (390, 844, True)}


@pytest.fixture
def captured(static_server: str, tmp_path: Path) -> list[Path]:
    from auditor.cli import app
    from typer.testing import CliRunner

    result = CliRunner().invoke(
        app, ["capture", static_server, "--out", str(tmp_path), "--viewports", "desktop,mobile"]
    )
    assert result.exit_code == 0, result.output
    folders = sorted(d for d in tmp_path.iterdir() if d.is_dir())
    assert len(folders) == 2
    return folders


@pytest.mark.browser
def test_capture_folders_are_well_formed(captured: list[Path]) -> None:
    seen = set()
    for folder in captured:
        meta = json.loads((folder / "meta.json").read_text())
        width, height, mobile = SPECS[meta["viewport"]]
        seen.add(meta["viewport"])
        spec = meta["viewport_spec"]
        assert (spec["width"], spec["height"], spec["is_mobile"]) == (width, height, mobile)
        assert spec["device_scale_factor"] == 1
        assert meta["generator_version"] == GENERATOR_VERSION
        steps = meta["focus_steps"]
        assert meta["focus_step_count"] == len(steps) == 5
        assert len({s["uid"] for s in steps}) == len(steps)
        assert meta["focus_run"]["stop_reason"] in {"left-page", "cycle"}
        for step in steps:
            assert (folder / step["file_on"]).is_file()
            assert (folder / step["file_off"]).is_file()
        versions = json.loads((folder / "VERSIONS.json").read_text())
        assert versions["playwright"] == "1.63.0"
        assert versions["chromium"].startswith("chromium 153.")
        assert {"axe", "model_sha", "protocol_sha", "git_sha"} <= set(versions)
        assert meta["tools"]["browser"].startswith("chromium 153.")
    assert seen == {"desktop", "mobile"}


@pytest.mark.browser
def test_capture_passes_benchmark_validator(captured: list[Path]) -> None:
    if not VALIDATOR.exists():
        _unavailable("validate_captures.py not available")
    proc = subprocess.run(
        [sys.executable, str(VALIDATOR), str(captured[0].parent)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert proc.returncode == 0, proc.stdout
    assert " 0 errors" in proc.stdout


@pytest.mark.browser
def test_replay_mode_loads_capture(captured: list[Path], tmp_path: Path) -> None:
    from auditor.cli import app
    from auditor.schema import Run
    from typer.testing import CliRunner

    folder = captured[0]
    out = tmp_path / "run"
    result = CliRunner().invoke(app, ["run", "--folder", str(folder), "--out", str(out)])
    assert result.exit_code == 0, result.output
    run = Run.model_validate_json((out / "report.json").read_text())
    assert run.source == str(folder)
    assert run.viewports == [json.loads((folder / "meta.json").read_text())["viewport"]]
    missing = CliRunner().invoke(app, ["run", "--folder", str(tmp_path)])
    assert missing.exit_code == 1


def _benchmark_meta_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    for meta in root.glob("*/meta.json"):
        keys |= set(json.loads(meta.read_text()))
    return keys


@pytest.mark.browser
def test_benchmark_only_keys_are_emitted_as_null(captured: list[Path]) -> None:
    from auditor.capture.driver import BENCHMARK_ONLY_KEYS

    for folder in captured:
        meta = json.loads((folder / "meta.json").read_text())
        assert all(k in meta and meta[k] is None for k in BENCHMARK_ONLY_KEYS)


@pytest.mark.browser
def test_meta_keys_superset_of_benchmark(captured: list[Path]) -> None:
    default = REPO.parent / "04_Data_Collection" / "benchmark_captures"
    bench = Path(os.environ.get("BENCHMARK_DIR", default))
    if not bench.is_dir():
        _unavailable("BENCHMARK_DIR not available")
    union = _benchmark_meta_keys(bench)
    for folder in captured:
        assert union <= set(json.loads((folder / "meta.json").read_text()))


def test_playwright_pin() -> None:
    pyproject = (REPO / "packages" / "auditor" / "pyproject.toml").read_text()
    assert '"playwright==1.63.0"' in pyproject


def test_snapshot_base_href_is_escaped(tmp_path: Path) -> None:
    (tmp_path / "dom.html").write_text("<html><head></head><body></body></html>")
    out = snapshot_html(tmp_path, {"final_url": 'http://x.test/a"b'})
    assert 'href="http://x.test/a&quot;b"' in out


def test_proxy_signals_matches_benchmark_copy() -> None:
    import hashlib

    from auditor.capture.driver import PROXY_JS

    original = REPO.parent / "04_Data_Collection" / "webui_proxy_signals.js"
    if not original.exists():
        _unavailable("benchmark tooling not available")
    assert (
        hashlib.sha256(PROXY_JS.read_bytes()).hexdigest()
        == hashlib.sha256(original.read_bytes()).hexdigest()
    )
