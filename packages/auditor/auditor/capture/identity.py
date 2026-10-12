from __future__ import annotations

import json
import os
from collections.abc import Mapping
from urllib.parse import urlparse

from auditor import __version__ as auditor_version

EXTRA_HEADERS_ENV = "AUDIT_EXTRA_HEADERS"
USER_AGENT_SUFFIX = f"WCAGAuditor/{auditor_version}"


def parse_extra_headers(raw: str | None) -> dict[str, str]:
    """Parse a JSON object of header names to values. Errors never quote the value."""
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise ValueError(
            f"{EXTRA_HEADERS_ENV} must be a JSON object of header names to values"
        ) from None
    if not isinstance(data, dict) or not all(
        isinstance(k, str) and k.strip() and isinstance(v, str) for k, v in data.items()
    ):
        raise ValueError(f"{EXTRA_HEADERS_ENV} must be a JSON object of header names to values")
    return {k.strip(): v for k, v in data.items()}


def extra_headers_from_env() -> dict[str, str]:
    return parse_extra_headers(os.environ.get(EXTRA_HEADERS_ENV))


def header_names(headers: Mapping[str, str]) -> list[str]:
    return sorted(headers)


def _bare_host(url: str) -> str:
    return (urlparse(url).hostname or "").lower().removeprefix("www.")


def same_site(request_url: str, target_url: str) -> bool:
    host = _bare_host(request_url)
    return bool(host) and host == _bare_host(target_url)


def identified_user_agent(base: str) -> str:
    return base if USER_AGENT_SUFFIX in base else f"{base} {USER_AGENT_SUFFIX}"
