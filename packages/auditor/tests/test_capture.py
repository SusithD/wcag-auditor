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
from typing import Any

import pytest
from auditor.capture import snapshot_html, step_focus
from auditor.capture.driver import GENERATOR_VERSION

REPO = Path(__file__).resolve().parents[3]
FIXTURES = REPO / "fixtures"
SITES = FIXTURES / "sites"
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


def _iou(a: dict[str, float], b: dict[str, float]) -> float:
    x0, y0 = max(a["x"], b["x"]), max(a["y"], b["y"])
    x1 = min(a["x"] + a["w"], b["x"] + b["w"])
    y1 = min(a["y"] + a["h"], b["y"] + b["h"])
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union else 0.0


def _focus_matches(capture: Any, elements: list[Any]) -> int:
    hits = 0
    for step in capture.focus_steps:
        rect = {
            "x": step.rect.x + step.scroll["x"],
            "y": step.rect.y + step.scroll["y"],
            "w": step.rect.w,
            "h": step.rect.h,
        }
        hits += any(
            e.dom_ref == step.selector and _iou(rect, e.bbox_css.model_dump()) >= 0.9
            for e in elements
            if e.kind not in {"text", "fixed_region"}
        )
    return hits


@pytest.mark.browser
def test_capture_time_geometry_matches_focus_rects_and_survives_offline_replay(
    captured: list[Path], tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import shutil

    from auditor.elements.dom import DomElementSource
    from auditor.schema import Capture

    white = "rgb(255, 255, 255)"
    for folder in captured:
        stored = json.loads((folder / "elements.json").read_text())
        assert stored["geometry_source"] == "capture" and stored["captured_at"]
        assert stored["viewport"]["width"] and stored["doc_size"]["height"] > 1200
        capture = Capture.from_folder(folder)
        source = DomElementSource()
        assert source.geometry_source(capture) == "capture"
        elements = source.elements(capture)
        title = next(e for e in elements if e.text == "Static fixture")
        assert title.style["color"] == white, "static.css was not applied"
        assert len(capture.focus_steps) == 5
        assert _focus_matches(capture, elements) == 5

        moved = tmp_path / "replay" / folder.name
        shutil.copytree(folder, moved)
        before = (moved / "elements.json").read_bytes()

        def no_browser(*_a: Any, **_k: Any) -> Any:
            raise AssertionError("replay must not launch a browser")

        monkeypatch.setattr(DomElementSource, "_rerender", no_browser)
        replay = DomElementSource().elements(Capture.from_folder(moved))
        monkeypatch.undo()
        assert [e.model_dump() for e in replay] == [e.model_dump() for e in elements]
        assert (moved / "elements.json").read_bytes() == before

        rerendered = DomElementSource(force_rerender=True).elements(capture)
        assert _focus_matches(capture, rerendered) <= 1
        assert next(e for e in rerendered if e.text == "Static fixture").style["color"] != white


@pytest.mark.browser
def test_page_without_focusable_elements_still_gets_geometry(
    static_server: str, tmp_path: Path
) -> None:
    from auditor.cli import app
    from auditor.elements.dom import DomElementSource
    from auditor.schema import Capture
    from typer.testing import CliRunner

    url = static_server.replace("static.html", "inert.html")
    result = CliRunner().invoke(
        app, ["capture", url, "--out", str(tmp_path), "--viewports", "desktop"]
    )
    assert result.exit_code == 0, result.output
    (folder,) = [d for d in tmp_path.iterdir() if d.is_dir()]
    capture = Capture.from_folder(folder)
    assert capture.focus_steps == []
    assert DomElementSource().geometry_source(capture) == "capture"
    assert any(e.kind == "text" for e in DomElementSource().elements(capture))


class _StubBrowser:
    versions = {"browser": "chromium 153.0.0.0", "playwright": "1.63.0"}

    def __init__(self, geometry: list[dict[str, Any]] | None) -> None:
        self.geometry = geometry

    def capture(self, url: str, folder: Path, vp: str, max_steps: int) -> dict[str, Any]:
        from PIL import Image

        Image.new("RGB", (4, 4), "white").save(folder / "screenshot.png")
        (folder / "dom.html").write_text("<html></html>")
        (folder / "proxy_findings.json").write_text("{}")
        return {
            "http_status": 200,
            "final_url": url,
            "title": "t",
            "screenshot_mode": "full_page",
            "focus_steps": [],
            "focus_run": {"presses": 0, "stop_reason": "left-page"},
            "layout": {},
            "test_elements_rendered": [],
            "geometry": self.geometry,
            "geometry_error": None if self.geometry is not None else "Error: boom",
            "doc_size": {"width": 4, "height": 4},
        }


def test_failed_extraction_keeps_capture_without_elements_json(tmp_path: Path) -> None:
    from auditor.capture import capture_url
    from auditor.elements.dom import DomElementSource, GeometryUnavailable
    from auditor.schema import Capture, ViewportSpec

    (folder,) = capture_url(_StubBrowser(None), "http://x.test/", tmp_path, ["desktop"])  # type: ignore[arg-type]
    assert not (folder / "elements.json").exists()
    meta = json.loads((folder / "meta.json").read_text())
    assert meta["geometry_error"] == "Error: boom"
    capture = Capture.model_construct(
        path=folder,
        meta=meta,
        viewport="desktop",
        viewport_spec=ViewportSpec.model_validate(meta["viewport_spec"]),
    )
    assert DomElementSource().geometry_source(capture) == "unavailable"
    with pytest.raises(GeometryUnavailable):
        DomElementSource().elements(capture)


def _synth_with_elements(tmp_path: Path, payload: str | None, origin: str) -> Any:
    import shutil

    from auditor.schema import Capture

    src = min(FIXTURES.glob("synth/sc2-5-8/*"))
    folder = tmp_path / "f"
    shutil.copytree(src, folder)
    meta = json.loads((folder / "meta.json").read_text())
    meta["origin"] = origin
    (folder / "meta.json").write_text(json.dumps(meta))
    if payload is not None:
        (folder / "elements.json").write_text(payload)
    return Capture.from_folder(folder)


def test_elements_json_takes_precedence_whatever_the_origin(tmp_path: Path) -> None:
    from auditor.elements.dom import DomElementSource

    good = json.dumps({"geometry_source": "capture", "elements": []})
    capture = _synth_with_elements(tmp_path, good, origin="real")
    assert DomElementSource().geometry_source(capture) == "capture"
    assert DomElementSource().elements(capture) == []


@pytest.mark.parametrize(
    "payload",
    ["{not json", json.dumps({"geometry_source": "capture"}), json.dumps({"elements": []})],
)
def test_corrupt_elements_json_is_geometry_unavailable(tmp_path: Path, payload: str) -> None:
    from auditor.elements.dom import DomElementSource, GeometryUnavailable

    capture = _synth_with_elements(tmp_path, payload, origin="synth")
    with pytest.raises(GeometryUnavailable):
        DomElementSource().elements(capture)


def test_unknown_origin_without_geometry_is_unavailable(tmp_path: Path) -> None:
    from auditor.elements.dom import DomElementSource

    capture = _synth_with_elements(tmp_path, None, origin="mystery")
    assert DomElementSource().geometry_source(capture) == "unavailable"


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
