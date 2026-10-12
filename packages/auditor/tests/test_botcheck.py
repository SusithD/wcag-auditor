from __future__ import annotations

import re
from pathlib import Path

import pytest
from auditor.capture import BotCheckError, detect_bot_check
from auditor.capture.botcheck import BOT_CHECK_MESSAGE

PAGES = Path(__file__).parent / "botcheck_pages"


def load(name: str) -> tuple[str, str, str]:
    html = (PAGES / name).read_text(encoding="utf-8")
    title = re.search(r"<title>(.*?)</title>", html, re.S)
    text = re.sub(r"<script.*?</script>|<[^>]+>", " ", html, flags=re.S)
    return (title.group(1) if title else ""), html, text


def test_cloudflare_interstitial_is_detected() -> None:
    title, html, text = load("cloudflare_interstitial.html")
    found = detect_bot_check({}, title, html, text)
    assert found is not None and found.vendor == "Cloudflare"
    assert "cloudflare challenge markup" in found.signals


def test_header_alone_is_conclusive() -> None:
    found = detect_bot_check({"CF-Mitigated": "challenge"}, "Home", "<html></html>", "")
    assert found is not None and found.signals == ("header cf-mitigated: challenge",)


def test_title_and_text_together_are_enough_but_not_alone() -> None:
    title, html, text = load("cloudflare_title_text_only.html")
    assert detect_bot_check({}, title, html, text) is not None
    assert detect_bot_check({}, title, html, "") is None
    assert detect_bot_check({}, "Home", html, text) is None


def test_datadome_frame_is_detected() -> None:
    title, html, text = load("datadome.html")
    found = detect_bot_check({}, title, html, text)
    assert found is not None and found.vendor == "DataDome"


def test_perimeterx_element_is_detected() -> None:
    found = detect_bot_check({}, "x", '<div id="px-captcha"></div>', "")
    assert found is not None and found.vendor == "PerimeterX"


@pytest.mark.parametrize("name", ["turnstile_login.html", "ordinary.html"])
def test_ordinary_pages_are_not_flagged(name: str) -> None:
    title, html, text = load(name)
    assert detect_bot_check({}, title, html, text) is None
    assert detect_bot_check({"cf-mitigated": ""}, title, html, text) is None


def test_error_carries_the_plain_sentence() -> None:
    title, html, text = load("cloudflare_interstitial.html")
    found = detect_bot_check({}, title, html, text)
    assert found is not None
    assert str(BotCheckError(found)) == BOT_CHECK_MESSAGE.format(vendor="Cloudflare")
    assert str(BotCheckError(found)).endswith("or upload screenshots instead.")
