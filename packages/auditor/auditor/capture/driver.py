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

from auditor import versions
from auditor.capture.focus import FOCUS_INFO_JS, FOCUS_START_JS, step_focus

GENERATOR_VERSION = f"auditor-{pkg_version('auditor')}"
PROTOCOL_VERSION = "1.0"
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
        from playwright.sync_api import sync_playwright

        self.timeout_ms = timeout_ms
        self.settle_ms = settle_ms
        self._pw_cm = sync_playwright()
        self._pw = self._pw_cm.__enter__()
        try:
            self._browser = self._pw.chromium.launch(headless=headless)
        except Exception:
            self._pw_cm.__exit__(None, None, None)
            raise
        js = PROXY_JS.read_text(encoding="utf-8")
        self._checks_fn = "() => {\n" + js + "\nreturn runAllProxyChecks();\n}"
        self.versions = {
            "browser": f"chromium {self._browser.version}",
            "playwright": pkg_version("playwright"),
        }

    def __enter__(self) -> PlaywrightBrowser:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        try:
            self._browser.close()
        finally:
            self._pw_cm.__exit__(None, None, None)

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
    max_focus_steps: int = 60,
    page_id: int = 1,
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
        except Exception:
            shutil.rmtree(tmp, ignore_errors=True)
            raise
        meta: dict[str, Any] = {
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
        (tmp / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        (tmp / "VERSIONS.json").write_text(
            json.dumps(versions.collect(meta), indent=2), encoding="utf-8"
        )
        tmp.rename(folder)
        folders.append(folder)
    return folders
