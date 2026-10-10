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


@pytest.mark.browser
def test_capture_static_page_validates(static_server: str, tmp_path: Path) -> None:
    from auditor.cli import app
    from typer.testing import CliRunner

    result = CliRunner().invoke(
        app, ["capture", static_server, "--out", str(tmp_path), "--viewports", "desktop,mobile"]
    )
    assert result.exit_code == 0, result.output
    folders = sorted(d for d in tmp_path.iterdir() if d.is_dir())
    assert len(folders) == 2

    meta = json.loads((folders[0] / "meta.json").read_text())
    assert meta["generator_version"] == GENERATOR_VERSION
    assert meta["focus_step_count"] >= 4
    assert meta["focus_run"]["stop_reason"] in {"left-page", "cycle"}

    versions = json.loads((folders[0] / "VERSIONS.json").read_text())
    assert versions["playwright"] == "1.63.0"
    assert meta["tools"]["browser"].startswith("chromium 153.")

    if VALIDATOR.exists():
        proc = subprocess.run(
            [sys.executable, str(VALIDATOR), str(tmp_path)], capture_output=True, text=True
        )
        assert proc.returncode == 0, proc.stdout
        assert " 0 errors" in proc.stdout


@pytest.mark.browser
def test_replay_mode_loads_capture(static_server: str, tmp_path: Path) -> None:
    from auditor.capture import PlaywrightBrowser, capture_url
    from auditor.cli import app
    from typer.testing import CliRunner

    with PlaywrightBrowser() as browser:
        (folder,) = capture_url(browser, static_server, tmp_path / "caps", ["desktop"])
    args = ["run", "--folder", str(folder), "--out", str(tmp_path / "run")]
    result = CliRunner().invoke(app, args)
    assert result.exit_code == 0, result.output
    assert (tmp_path / "run" / "report.json").is_file()


def _benchmark_meta_keys(root: Path) -> set[str]:
    keys: set[str] = set()
    for meta in root.glob("*/meta.json"):
        keys |= set(json.loads(meta.read_text()))
    return keys


@pytest.mark.browser
def test_meta_keys_superset_of_benchmark(static_server: str, tmp_path: Path) -> None:
    from auditor.capture import PlaywrightBrowser, capture_url

    default = REPO.parent / "04_Data_Collection" / "benchmark_captures"
    bench = Path(os.environ.get("BENCHMARK_DIR", default))
    if not bench.is_dir():
        pytest.skip("BENCHMARK_DIR not available")
    union = _benchmark_meta_keys(bench) - {
        "synthetic_page_id",
        "seeded_sc",
        "webui_page_id",
        "domain",
        "selected_for_proxy_signals",
        "sampling_frame",
        "truth_note",
    }
    with PlaywrightBrowser() as browser:
        (folder,) = capture_url(browser, static_server, tmp_path, ["desktop"])
    assert union <= set(json.loads((folder / "meta.json").read_text()))
