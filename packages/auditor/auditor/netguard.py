from __future__ import annotations

import ipaddress
import os
import socket
from collections.abc import Callable
from typing import Any
from urllib.parse import urlsplit

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
Resolver = Callable[[str], list[str]]

PRIVATE_TARGET_MESSAGE = (
    "That address points to a private or local network, which this server does not audit."
)
WEB_SCHEMES = {"http", "https", "ws", "wss"}
SAFE_SCHEMES = {"data", "blob", "about"}

EXTRA_BLOCKED = tuple(
    ipaddress.ip_network(n)
    for n in ("100.64.0.0/10", "192.0.0.0/24", "198.18.0.0/15", "64:ff9b::/96")
)


def env_allows_private_targets() -> bool:
    value = os.environ.get("ALLOW_PRIVATE_TARGETS", "1").strip().lower()
    return value not in {"0", "false", "no", ""}


def is_public_address(value: str) -> bool:
    try:
        ip: IPAddress = ipaddress.ip_address(value.split("%", 1)[0])
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return is_public_address(str(ip.ipv4_mapped))
        if ip.sixtofour is not None and not is_public_address(str(ip.sixtofour)):
            return False
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
        or (isinstance(ip, ipaddress.IPv6Address) and ip.is_site_local)
    ):
        return False
    if any(ip in net for net in EXTRA_BLOCKED if net.version == ip.version):
        return False
    return ip.is_global


def system_resolver(host: str) -> list[str]:
    infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return list(dict.fromkeys(str(info[4][0]) for info in infos))


def host_is_public(host: str, resolver: Resolver = system_resolver) -> bool:
    name = host.strip("[]").rstrip(".")
    if not name:
        return False
    try:
        addresses = resolver(name)
    except OSError:
        return False
    return bool(addresses) and all(is_public_address(a) for a in addresses)


def url_is_public(url: str, resolver: Resolver = system_resolver) -> bool:
    parts = urlsplit(url)
    if parts.scheme in SAFE_SCHEMES:
        return True
    if parts.scheme not in WEB_SCHEMES or not parts.hostname:
        return False
    return host_is_public(parts.hostname, resolver)


def target_problem(url: str, resolver: Resolver | None = None) -> str | None:
    resolve = resolver or system_resolver
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        return "Enter a web address that starts with http:// or https://"
    name = parts.hostname.strip("[]").rstrip(".")
    try:
        addresses = resolve(name)
    except OSError:
        return "That address could not be found. Check the spelling and try again."
    if not addresses or not all(is_public_address(a) for a in addresses):
        return PRIVATE_TARGET_MESSAGE
    return None


def install_route_guard(context: Any, resolver: Resolver = system_resolver) -> None:
    verdicts: dict[str, bool] = {}

    def handler(route: Any, request: Any) -> None:
        parts = urlsplit(request.url)
        if parts.scheme in SAFE_SCHEMES:
            route.continue_()
            return
        host = (parts.hostname or "").lower()
        ok = verdicts.get(host)
        if ok is None:
            ok = parts.scheme in WEB_SCHEMES and host_is_public(host, resolver)
            verdicts[host] = ok
        if ok:
            route.continue_()
        else:
            route.abort("blockedbyclient")

    context.route("**/*", handler)
