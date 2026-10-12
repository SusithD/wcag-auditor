from __future__ import annotations

import http.server
import json
import threading
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from auditor import capture as capture_pkg
from auditor.capture import BotCheckError, PlaywrightBrowser, capture_url
from auditor.capture.botcheck import BotCheck, wait_until_clear
from auditor.capture.identity import (
    USER_AGENT_SUFFIX,
    identified_user_agent,
    parse_extra_headers,
    same_site,
)

SECRET = "s3cr3t-value-123"


def test_parse_extra_headers_accepts_an_object_and_trims_names() -> None:
    assert parse_extra_headers(f'{{" X-Audit-Key ": "{SECRET}"}}') == {"X-Audit-Key": SECRET}
    assert parse_extra_headers(None) == {}
    assert parse_extra_headers("  ") == {}


@pytest.mark.parametrize(
    "raw",
    [f'["{SECRET}"]', f'{{"X-Key": 5, "y": "{SECRET}"}}', f'{{"X-Key": "{SECRET}"', f'"{SECRET}"'],
)
def test_bad_extra_headers_fail_without_echoing_values(raw: str) -> None:
    with pytest.raises(ValueError) as caught:
        parse_extra_headers(raw)
    assert SECRET not in str(caught.value)


def test_same_site_matches_only_the_audited_host() -> None:
    assert same_site("https://www.example.com/a", "https://example.com/")
    assert not same_site("https://cdn.thirdparty.com/x.js", "https://example.com/")
    assert not same_site("https://example.com.evil.com/", "https://example.com/")


def test_user_agent_carries_the_identifying_suffix_once() -> None:
    ua = identified_user_agent("Mozilla/5.0 Chrome/1")
    assert ua.endswith(USER_AGENT_SUFFIX)
    assert identified_user_agent(ua) == ua


def _found() -> BotCheck:
    return BotCheck("Cloudflare", ("x",))


def test_wait_loop_returns_none_once_the_check_clears() -> None:
    answers = iter([_found(), _found(), None])
    clock = [0.0]
    waited: list[int] = []

    def sleep(seconds: float) -> None:
        clock[0] += seconds

    result = wait_until_clear(
        lambda: next(answers),
        _found(),
        timeout_s=300,
        poll_s=3,
        sleep=sleep,
        now=lambda: clock[0],
        on_wait=waited.append,
    )
    assert result is None
    assert waited == [300, 297, 294]


def test_wait_loop_gives_up_at_the_timeout_and_survives_errors() -> None:
    clock = [0.0]

    def broken() -> BotCheck | None:
        raise RuntimeError("page navigating")

    result = wait_until_clear(
        broken,
        _found(),
        timeout_s=10,
        poll_s=3,
        sleep=lambda s: clock.__setitem__(0, clock[0] + s),
        now=lambda: clock[0],
    )
    assert result is not None and clock[0] == 10


class FakeResponse:
    status = 200
    headers: dict[str, str] = {}


class FakePage:
    def __init__(self, challenge_polls: int) -> None:
        self.polls_left = challenge_polls
        self.timeouts: list[int] = []

    def on(self, *_: Any) -> None:
        pass

    def set_default_timeout(self, _: int) -> None:
        pass

    def goto(self, *_: Any, **__: Any) -> FakeResponse:
        return FakeResponse()

    def wait_for_load_state(self, *_: Any, **__: Any) -> None:
        pass

    def wait_for_timeout(self, ms: int) -> None:
        self.timeouts.append(ms)

    def _challenged(self) -> bool:
        return self.polls_left > 0

    def title(self) -> str:
        return "Just a moment..." if self._challenged() else "Home"

    def content(self) -> str:
        if self._challenged():
            return '<form id="challenge-form"></form>'
        return "<html></html>"

    def inner_text(self, *_: Any, **__: Any) -> str:
        self.polls_left -= 1 if self.polls_left > 0 else 0
        return ""


class FakeContext:
    def __init__(self, page: FakePage) -> None:
        self.pages = [page]

    def new_page(self) -> FakePage:
        return self.pages[0]


def _browser(verify_timeout_s: float, waits: list[int]) -> PlaywrightBrowser:
    browser = object.__new__(PlaywrightBrowser)
    browser.timeout_ms = 1000
    browser.settle_ms = 0
    browser.profile_dir = Path("unused")
    browser.verify_timeout_s = verify_timeout_s
    browser.on_wait = waits.append
    browser._extra_headers = {}
    return browser


def test_open_waits_for_the_person_then_continues() -> None:
    waits: list[int] = []
    page = FakePage(challenge_polls=3)
    opened, status = _browser(30, waits)._open(FakeContext(page), "https://example.com")
    assert opened is page and status == 200
    assert len(waits) >= 1


def test_open_fails_with_the_bot_check_message_when_nobody_passes_it() -> None:
    waits: list[int] = []
    page = FakePage(challenge_polls=10**9)
    with pytest.raises(BotCheckError, match="showed a bot check"):
        _browser(0.2, waits)._open(FakeContext(page), "https://example.com")
    assert waits


def test_open_without_verify_fails_immediately() -> None:
    waits: list[int] = []
    page = FakePage(challenge_polls=10**9)
    with pytest.raises(BotCheckError):
        _browser(0, waits)._open(FakeContext(page), "https://example.com")
    assert waits == []


def test_audit_emits_the_waiting_event_and_fails_with_one_sentence(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from auditor.audit import audit
    from auditor.capture.botcheck import BOT_CHECK_MESSAGE

    seen: dict[str, Any] = {}

    class FakeBrowser:
        def __init__(self, **kwargs: Any) -> None:
            seen.update(kwargs)
            self.on_wait = kwargs["on_wait"]

        def __enter__(self) -> FakeBrowser:
            return self

        def __exit__(self, *_: object) -> None:
            pass

    def fake_capture(
        browser: Any, url: str, out: Path, vps: list[str], *a: Any, **kw: Any
    ) -> list[Path]:
        browser.on_wait(240)
        kw["errors"].append(f"{vps[0]}: {BOT_CHECK_MESSAGE.format(vendor='Cloudflare')}")
        return []

    monkeypatch.setattr(capture_pkg, "PlaywrightBrowser", FakeBrowser)
    monkeypatch.setattr(capture_pkg, "capture_url", fake_capture)
    code = audit(
        tmp_path,
        url="https://example.com",
        viewports=["desktop"],
        pdf=False,
        profile_dir=tmp_path / "profile",
        verify_timeout_s=240,
    )
    assert code == 1
    events = [json.loads(x) for x in (tmp_path / "events.jsonl").read_text().splitlines()]
    waiting = [e for e in events if e["stage"] == "waiting:verify"]
    assert waiting == [{**waiting[0], "viewport": "desktop", "detail": "240"}]
    assert seen["profile_dir"] == tmp_path / "profile" and seen["verify_timeout_s"] == 240
    summary = json.loads((tmp_path / "summary.json").read_text())
    assert summary["status"] == "failed"
    assert summary["errors"]["desktop"].startswith("The site showed a bot check")


class _Seen(http.server.BaseHTTPRequestHandler):
    requests: list[dict[str, str]] = []

    def do_GET(self) -> None:
        type(self).requests.append({k.lower(): v for k, v in self.headers.items()})
        body = b"<html><head><title>Home</title></head><body><a href='#'>x</a></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_: Any) -> None:
        pass


@pytest.fixture
def server() -> Iterator[str]:
    _Seen.requests = []
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Seen)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}/"
    httpd.shutdown()


@pytest.mark.browser
def test_extra_headers_and_user_agent_are_sent_but_the_secret_is_never_recorded(
    server: str, tmp_path: Path
) -> None:
    with PlaywrightBrowser(extra_headers={"X-Audit-Key": SECRET}) as browser:
        folders = capture_url(browser, server, tmp_path, ["desktop"], max_focus_steps=2)
    sent = _Seen.requests[0]
    assert sent["x-audit-key"] == SECRET
    assert sent["user-agent"].endswith(USER_AGENT_SUFFIX)
    meta = json.loads((folders[0] / "meta.json").read_text())
    assert meta["request_header_names"] == ["X-Audit-Key"]
    assert meta["user_agent_suffix"] == USER_AGENT_SUFFIX
    for path in folders[0].rglob("*"):
        if path.is_file() and path.suffix in {".json", ".html", ".jsonl"}:
            assert SECRET not in path.read_text(errors="ignore"), path
