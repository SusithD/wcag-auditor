from __future__ import annotations

import contextlib
import hashlib
import json
import re
import shutil
from datetime import UTC, datetime
from importlib.metadata import version as pkg_version
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from auditor import __version__ as auditor_version
from auditor import versions
from auditor.capture.focus import FOCUS_INFO_JS, FOCUS_START_JS, step_focus
from auditor.elements.extract_js import EXTRACT_JS, extract_args, write_elements

GENERATOR_VERSION = f"auditor-{auditor_version}"
PROTOCOL_VERSION = "1.0"
BENCHMARK_ONLY_KEYS = (
    "domain",
    "sampling_frame",
    "seeded_sc",
    "selected_for_proxy_signals",
    "synthetic_page_id",
    "truth_note",
    "webui_page_id",
)
PROXY_JS = Path(__file__).with_name("proxy_signals.js")
LAYOUT_JS = Path(__file__).with_name("layout.js").read_text(encoding="utf-8")
TEST_ELEMENTS_JS = Path(__file__).with_name("test_elements.js").read_text(encoding="utf-8")

VIEWPORTS: dict[str, dict[str, Any]] = {
    "desktop": {"width": 1440, "height": 900, "is_mobile": False, "has_touch": False},
    "mobile": {"width": 390, "height": 844, "is_mobile": True, "has_touch": True},
}


COORDINATES_NOTE = (
    "screenshot.png: 1 px = 1 CSS px. focus-NNN.png: viewport image; a focus step's "
    "rect is in CSS px, so its position in the PNG = rect x png_scale (png_scale < 1 "
    "when a non-responsive page is shown zoomed out under mobile emulation)."
)


class PlaywrightBrowser:
    def __init__(
        self, headless: bool = True, timeout_ms: int = 20000, settle_ms: int = 1500
    ) -> None:
        from auditor import browser as shared

        self.timeout_ms = timeout_ms
        self.settle_ms = settle_ms
        self._closed = False
        self._pw = shared.acquire()
        try:
            self._browser = self._pw.chromium.launch(headless=headless)
            try:
                js = PROXY_JS.read_text(encoding="utf-8")
                self._checks_fn = "() => {\n" + js + "\nreturn runAllProxyChecks();\n}"
                self.versions = {
                    "browser": f"chromium {self._browser.version}",
                    "playwright": pkg_version("playwright"),
                }
            except Exception:
                self._browser.close()
                raise
        except Exception:
            shared.release()
            raise

    def __enter__(self) -> PlaywrightBrowser:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        try:
            self._browser.close()
        finally:
            from auditor import browser as shared

            shared.release()

    def _context(self, viewport: str) -> Any:
        vp = VIEWPORTS[viewport]
        return self._browser.new_context(
            viewport={"width": vp["width"], "height": vp["height"]},
            device_scale_factor=1,
            is_mobile=vp["is_mobile"],
            has_touch=vp["has_touch"],
            bypass_csp=True,
            locale="en-US",
            timezone_id="UTC",
            ignore_https_errors=True,
        )

    def _open(self, ctx: Any, url: str) -> tuple[Any, int | None]:
        page = ctx.new_page()
        page.set_default_timeout(self.timeout_ms)
        page.on("dialog", lambda d: d.dismiss())
        resp = page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
        with contextlib.suppress(Exception):
            page.wait_for_load_state("networkidle", timeout=4000)
        page.wait_for_timeout(self.settle_ms)
        return page, (resp.status if resp else None)

    def _checks(self, page: Any) -> dict[str, Any]:
        for attempt in range(2):
            try:
                return page.evaluate(self._checks_fn)  # type: ignore[no-any-return]
            except Exception as e:
                if attempt == 0 and "context" in str(e).lower():
                    page.wait_for_timeout(2000)
                    continue
                raise
        raise RuntimeError("unreachable")

    def capture(
        self, url: str, folder: Path, viewport: str, max_focus_steps: int
    ) -> dict[str, Any]:
        ctx = self._context(viewport)
        try:
            page, status = self._open(ctx, url)
            geometry: list[dict[str, Any]] | None
            geometry_error: str | None = None
            try:
                geometry = page.evaluate(EXTRACT_JS, extract_args())
            except Exception as exc:
                geometry, geometry_error = None, f"{type(exc).__name__}: {exc}"
            doc_size = page.evaluate(
                "() => ({ width: document.documentElement.scrollWidth,"
                " height: document.documentElement.scrollHeight })"
            )
            shot: dict[str, Any] = {"animations": "disabled", "caret": "hide"}
            mode = "full_page"
            try:
                page.screenshot(path=str(folder / "screenshot.png"), full_page=True, **shot)
            except Exception:
                mode = "viewport_fallback"
                page.screenshot(path=str(folder / "screenshot.png"), **shot)
            (folder / "dom.html").write_text(page.content(), encoding="utf-8")
            layout = page.evaluate(LAYOUT_JS)
            test_elements = page.evaluate(TEST_ELEMENTS_JS)

            page.evaluate(FOCUS_START_JS)

            def press() -> None:
                page.keyboard.press("Tab")
                page.wait_for_timeout(200)

            def shoot(k: int, info: dict[str, Any]) -> dict[str, Any]:
                on, off = f"focus-{k:03d}.png", f"focus-{k:03d}-off.png"
                page.screenshot(path=str(folder / on), **shot)
                page.evaluate(
                    "() => { window.__a11yF = document.activeElement;"
                    " window.__a11yF && window.__a11yF.blur(); }"
                )
                page.wait_for_timeout(200)
                page.screenshot(path=str(folder / off), **shot)
                page.evaluate(
                    "() => { window.__a11yF && window.__a11yF.focus({ preventScroll: true }); }"
                )
                return {"file_on": on, "file_off": off}

            steps, focus_run = step_focus(
                press, lambda: page.evaluate(FOCUS_INFO_JS), shoot, max_focus_steps
            )

            page.evaluate(
                "() => { if (document.activeElement) document.activeElement.blur();"
                " window.scrollTo(0, 0); }"
            )
            findings = self._checks(page)
            (folder / "proxy_findings.json").write_text(
                json.dumps(findings, indent=2), encoding="utf-8"
            )
            return {
                "http_status": status,
                "final_url": page.url,
                "title": page.title(),
                "screenshot_mode": mode,
                "focus_steps": steps,
                "focus_run": focus_run,
                "layout": layout,
                "test_elements_rendered": test_elements,
                "geometry": geometry,
                "geometry_error": geometry_error,
                "doc_size": doc_size,
            }
        finally:
            ctx.close()


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _slug(url: str) -> str:
    host = (urlparse(url).hostname or "page").lower().removeprefix("www.")
    return re.sub(r"[^a-z0-9]+", "-", host).strip("-") or "page"


def capture_url(
    browser: PlaywrightBrowser,
    url: str,
    out: Path,
    viewports: list[str],
    max_focus_steps: int = 15,
    page_id: int = 1,
    errors: list[str] | None = None,
) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    folders: list[Path] = []
    for vp in viewports:
        ts = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        folder = out / f"real_{_slug(url)}_{page_id:03d}_{vp}_{ts}"
        tmp = out / f".partial_{folder.name}"
        if tmp.exists():
            shutil.rmtree(tmp)
        tmp.mkdir(parents=True)
        try:
            res = browser.capture(url, tmp, vp, max_focus_steps)
        except Exception as exc:
            shutil.rmtree(tmp, ignore_errors=True)
            if errors is None:
                raise
            errors.append(f"{vp}: {type(exc).__name__}: {exc}")
            continue
        meta: dict[str, Any] = {
            **dict.fromkeys(BENCHMARK_ONLY_KEYS),
            "geometry_error": res["geometry_error"],
            "origin": "real",
            "sector": _slug(url),
            "page_id": page_id,
            "viewport": vp,
            "viewport_spec": {**VIEWPORTS[vp], "device_scale_factor": 1},
            "capture_timestamp": ts,
            "url": url,
            "final_url": res["final_url"],
            "http_status": res["http_status"],
            "title": res["title"],
            "screenshot_mode": res["screenshot_mode"],
            "screenshot_sha256": _sha256(tmp / "screenshot.png"),
            "focus_step_count": len(res["focus_steps"]),
            "focus_steps": res["focus_steps"],
            "focus_run": res["focus_run"],
            "layout": res["layout"],
            "test_elements_rendered": res["test_elements_rendered"],
            "coordinates": COORDINATES_NOTE,
            "generator_version": GENERATOR_VERSION,
            "protocol_version": PROTOCOL_VERSION,
            "tools": browser.versions,
        }
        if res["geometry"] is not None:
            write_elements(
                tmp,
                res["geometry"],
                ts,
                {**VIEWPORTS[vp], "device_scale_factor": 1},
                res["doc_size"],
            )
        (tmp / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        (tmp / "VERSIONS.json").write_text(
            json.dumps(versions.collect(meta), indent=2), encoding="utf-8"
        )
        if folder.exists():
            shutil.rmtree(tmp, ignore_errors=True)
            raise FileExistsError(f"{folder} already exists (same-second capture)")
        tmp.rename(folder)
        folders.append(folder)
    return folders
