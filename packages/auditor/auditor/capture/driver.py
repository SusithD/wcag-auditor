from __future__ import annotations

import contextlib
import hashlib
import json
import re
import shutil
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from importlib.metadata import version as pkg_version
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from auditor import __version__ as auditor_version
from auditor import netguard, versions
from auditor.capture.botcheck import BotCheck, BotCheckError, detect_bot_check, wait_until_clear
from auditor.capture.focus import FOCUS_INFO_JS, FOCUS_START_JS, step_focus
from auditor.capture.identity import (
    USER_AGENT_SUFFIX,
    extra_headers_from_env,
    header_names,
    identified_user_agent,
    same_site,
)
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
        self,
        headless: bool = True,
        timeout_ms: int = 20000,
        settle_ms: int = 1500,
        *,
        profile_dir: Path | None = None,
        verify_timeout_s: float = 0,
        extra_headers: Mapping[str, str] | None = None,
        on_wait: Callable[[int], None] | None = None,
    ) -> None:
        from auditor import browser as shared

        self.timeout_ms = timeout_ms
        self.settle_ms = settle_ms
        self.profile_dir = profile_dir
        self.verify_timeout_s = verify_timeout_s if profile_dir is not None else 0
        self.on_wait = on_wait
        self._extra_headers = dict(
            extra_headers if extra_headers is not None else extra_headers_from_env()
        )
        self.extra_header_names = header_names(self._extra_headers)
        self._closed = False
        self._pw = shared.acquire()
        try:
            self._browser: Any = self._pw.chromium.launch(headless=headless)
            try:
                probe = self._browser.new_context()
                try:
                    probe_page = probe.new_page()
                    self.user_agent = identified_user_agent(
                        probe_page.evaluate("() => navigator.userAgent")
                    )
                finally:
                    probe.close()
                js = PROXY_JS.read_text(encoding="utf-8")
                self._checks_fn = "() => {\n" + js + "\nreturn runAllProxyChecks();\n}"
                self.versions = {
                    "browser": f"chromium {self._browser.version}",
                    "playwright": pkg_version("playwright"),
                }
                if profile_dir is not None:
                    profile_dir.mkdir(parents=True, exist_ok=True)
                    self._browser.close()
                    self._browser = None
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
            if self._browser is not None:
                self._browser.close()
        finally:
            from auditor import browser as shared

            shared.release()

    def _context(self, viewport: str) -> Any:
        vp = VIEWPORTS[viewport]
        options: dict[str, Any] = {
            "viewport": {"width": vp["width"], "height": vp["height"]},
            "device_scale_factor": 1,
            "is_mobile": vp["is_mobile"],
            "has_touch": vp["has_touch"],
            "bypass_csp": True,
            "locale": "en-US",
            "timezone_id": "UTC",
            "ignore_https_errors": True,
            "user_agent": self.user_agent,
        }
        if self.profile_dir is not None:
            return self._pw.chromium.launch_persistent_context(
                str(self.profile_dir), headless=False, **options
            )
        return self._browser.new_context(**options)

    def _install_routing(self, ctx: Any, url: str) -> None:
        extra = self._extra_headers

        def send(route: Any, request: Any) -> None:
            if extra and same_site(request.url, url):
                route.continue_(headers={**request.headers, **extra})
            else:
                route.continue_()

        if not netguard.env_allows_private_targets():
            netguard.install_route_guard(ctx, on_allowed=send)
        elif extra:
            ctx.route("**/*", lambda route: send(route, route.request))

    def _open(self, ctx: Any, url: str) -> tuple[Any, int | None]:
        self._install_routing(ctx, url)
        page = ctx.pages[0] if self.profile_dir is not None and ctx.pages else ctx.new_page()
        page.set_default_timeout(self.timeout_ms)
        page.on("dialog", lambda d: d.dismiss())
        document_headers: dict[str, str] = {}

        def note_document(response: Any) -> None:
            with contextlib.suppress(Exception):
                if response.request.is_navigation_request() and response.frame == page.main_frame:
                    document_headers.clear()
                    document_headers.update(response.headers)

        page.on("response", note_document)
        resp = page.goto(url, wait_until="domcontentloaded", timeout=self.timeout_ms)
        with contextlib.suppress(Exception):
            page.wait_for_load_state("networkidle", timeout=4000)
        page.wait_for_timeout(self.settle_ms)
        first_headers: Mapping[str, str] = resp.headers if resp else {}

        def check() -> BotCheck | None:
            return self._detect(page, document_headers or first_headers)

        found = check()
        if found is not None and self.verify_timeout_s > 0:
            found = wait_until_clear(
                check,
                found,
                timeout_s=self.verify_timeout_s,
                poll_s=3,
                sleep=lambda s: page.wait_for_timeout(int(s * 1000)),
                on_wait=self.on_wait,
            )
            if found is None:
                with contextlib.suppress(Exception):
                    page.wait_for_load_state("networkidle", timeout=4000)
                page.wait_for_timeout(self.settle_ms)
        if found is not None:
            raise BotCheckError(found)
        return page, (resp.status if resp else None)

    def _detect(self, page: Any, headers: Mapping[str, str]) -> BotCheck | None:
        text = ""
        with contextlib.suppress(Exception):
            text = page.inner_text("body", timeout=3000)
        return detect_bot_check(headers, page.title(), page.content(), text)

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
            reason = str(exc) if isinstance(exc, BotCheckError) else f"{type(exc).__name__}: {exc}"
            errors.append(f"{vp}: {reason}")
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
            "user_agent_suffix": USER_AGENT_SUFFIX,
            "request_header_names": list(getattr(browser, "extra_header_names", [])),
            "headed_session": getattr(browser, "profile_dir", None) is not None,
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
