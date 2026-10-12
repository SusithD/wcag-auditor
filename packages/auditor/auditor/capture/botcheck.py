from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

BOT_CHECK_MESSAGE = (
    "The site showed a bot check ({vendor}) instead of the page, so the audit was stopped. "
    "Audit a page without bot protection, or upload screenshots instead."
)

_CF_TITLE = re.compile(r"^\s*just a moment\.{0,3}\s*$", re.IGNORECASE)
_CF_TEXT = re.compile(r"verify you are human|performing security verification", re.IGNORECASE)
_CF_STRONG_MARKUP = re.compile(
    r"""id\s*=\s*["']challenge-form["']|cf_chl_opt|cf-chl""", re.IGNORECASE
)
_CF_HOST = re.compile(
    r"""<(?:iframe|script)\b[^>]*\bsrc\s*=\s*["'][^"']*challenges\.cloudflare\.com""",
    re.IGNORECASE,
)
_DATADOME = re.compile(
    r"""<(?:iframe|script)\b[^>]*\bsrc\s*=\s*["'][^"']*captcha-delivery\.com""", re.IGNORECASE
)
_PERIMETERX = re.compile(r"""id\s*=\s*["']px-captcha["']""", re.IGNORECASE)


@dataclass(frozen=True)
class BotCheck:
    vendor: str
    signals: tuple[str, ...]


class BotCheckError(RuntimeError):
    def __init__(self, check: BotCheck) -> None:
        super().__init__(BOT_CHECK_MESSAGE.format(vendor=check.vendor))
        self.check = check


def detect_bot_check(
    headers: Mapping[str, str] | None, title: str, html: str, text: str
) -> BotCheck | None:
    """Strong signals alone are conclusive. Title, challenge text and a challenges.cloudflare.com
    frame also occur on ordinary pages (a Turnstile form), so two of them are needed."""
    lowered = {k.lower(): v for k, v in (headers or {}).items()}
    strong: list[str] = []
    if "challenge" in lowered.get("cf-mitigated", "").lower():
        strong.append("header cf-mitigated: challenge")
    if _CF_STRONG_MARKUP.search(html):
        strong.append("cloudflare challenge markup")
    weak: list[str] = []
    if _CF_TITLE.match(title or ""):
        weak.append("title Just a moment")
    if _CF_TEXT.search(text or ""):
        weak.append("challenge text")
    if _CF_HOST.search(html):
        weak.append("challenges.cloudflare.com frame or script")
    if strong or len(weak) >= 2:
        return BotCheck("Cloudflare", tuple(strong + weak))
    if _DATADOME.search(html):
        return BotCheck("DataDome", ("captcha-delivery.com frame or script",))
    if _PERIMETERX.search(html):
        return BotCheck("PerimeterX", ("#px-captcha element",))
    return None
