from __future__ import annotations

from typing import Any

import pytest
from auditor import netguard


@pytest.mark.parametrize(
    "address",
    [
        "127.0.0.1",
        "127.9.9.9",
        "10.0.0.5",
        "172.16.0.1",
        "172.31.255.254",
        "192.168.1.1",
        "169.254.169.254",
        "169.254.0.1",
        "100.64.0.1",
        "100.127.255.254",
        "224.0.0.1",
        "239.255.255.250",
        "240.0.0.1",
        "255.255.255.255",
        "0.0.0.0",
        "198.18.0.1",
        "::1",
        "::",
        "fc00::1",
        "fd12:3456:789a::1",
        "fe80::1",
        "ff02::1",
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "::ffff:169.254.169.254",
        "2002:7f00:1::1",
        "64:ff9b::7f00:1",
        "not-an-ip",
    ],
)
def test_non_public_addresses_are_blocked(address: str) -> None:
    assert not netguard.is_public_address(address)


@pytest.mark.parametrize(
    "address",
    ["8.8.8.8", "93.184.216.34", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700::1111"],
)
def test_public_addresses_are_allowed(address: str) -> None:
    assert netguard.is_public_address(address)


def resolver(mapping: dict[str, list[str]]) -> Any:
    def resolve(host: str) -> list[str]:
        if host not in mapping:
            raise OSError("no such host")
        return mapping[host]

    return resolve


def test_hostname_resolving_to_private_ip_is_blocked() -> None:
    res = resolver({"evil.example": ["10.1.2.3"]})
    assert netguard.target_problem("http://evil.example/", res) == netguard.PRIVATE_TARGET_MESSAGE


def test_any_private_record_blocks_the_host() -> None:
    res = resolver({"rebind.example": ["93.184.216.34", "127.0.0.1"]})
    assert netguard.target_problem("https://rebind.example", res) == netguard.PRIVATE_TARGET_MESSAGE
    res = resolver({"rebind6.example": ["93.184.216.34", "fe80::1"]})
    assert (
        netguard.target_problem("https://rebind6.example", res) == netguard.PRIVATE_TARGET_MESSAGE
    )


def test_ip_literal_hosts() -> None:
    res = resolver({"127.0.0.1": ["127.0.0.1"], "[::1]": ["::1"], "::1": ["::1"]})
    assert netguard.target_problem("http://127.0.0.1:8000/", res) == netguard.PRIVATE_TARGET_MESSAGE
    assert netguard.target_problem("http://[::1]/", res) == netguard.PRIVATE_TARGET_MESSAGE


def test_public_host_passes_and_unknown_host_reports_not_found() -> None:
    res = resolver({"ok.example": ["93.184.216.34", "2606:4700::1111"]})
    assert netguard.target_problem("https://ok.example/path", res) is None
    assert "could not be found" in (netguard.target_problem("https://missing.example", res) or "")


@pytest.mark.parametrize("url", ["ftp://ok.example", "file:///etc/passwd", "javascript:alert(1)"])
def test_non_http_schemes_are_rejected(url: str) -> None:
    res = resolver({"ok.example": ["93.184.216.34"]})
    assert netguard.target_problem(url, res) is not None


class FakeRoute:
    def __init__(self) -> None:
        self.outcome = ""

    def continue_(self) -> None:
        self.outcome = "continue"

    def abort(self, reason: str) -> None:
        self.outcome = f"abort:{reason}"


class FakeRequest:
    def __init__(self, url: str) -> None:
        self.url = url


class FakeContext:
    handler: Any = None

    def route(self, pattern: str, handler: Any) -> None:
        self.handler = handler


def outcome(ctx: FakeContext, url: str) -> str:
    route = FakeRoute()
    ctx.handler(route, FakeRequest(url))
    return route.outcome


def test_route_guard_blocks_internal_subresources_and_redirect_targets() -> None:
    ctx = FakeContext()
    netguard.install_route_guard(
        ctx,
        resolver({"cdn.example": ["93.184.216.34"], "internal.example": ["10.0.0.9"]}),
    )
    assert outcome(ctx, "https://cdn.example/app.js") == "continue"
    assert outcome(ctx, "http://internal.example/admin") == "abort:blockedbyclient"
    assert outcome(ctx, "http://169.254.169.254/latest/meta-data/") != "continue"
    assert outcome(ctx, "http://127.0.0.1:9/") != "continue"
    assert outcome(ctx, "file:///etc/passwd") == "abort:blockedbyclient"
    assert outcome(ctx, "data:text/plain,hi") == "continue"


def test_route_guard_hands_allowed_requests_to_the_callback_and_still_aborts_the_rest() -> None:
    ctx = FakeContext()
    handed: list[str] = []
    netguard.install_route_guard(
        ctx,
        resolver({"cdn.example": ["93.184.216.34"], "internal.example": ["10.0.0.9"]}),
        on_allowed=lambda route, request: handed.append(request.url),
    )
    outcome(ctx, "https://cdn.example/app.js")
    assert outcome(ctx, "http://internal.example/admin") == "abort:blockedbyclient"
    assert handed == ["https://cdn.example/app.js"]


def test_env_switch(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALLOW_PRIVATE_TARGETS", raising=False)
    assert netguard.env_allows_private_targets()
    monkeypatch.setenv("ALLOW_PRIVATE_TARGETS", "0")
    assert not netguard.env_allows_private_targets()
    monkeypatch.setenv("ALLOW_PRIVATE_TARGETS", "1")
    assert netguard.env_allows_private_targets()
