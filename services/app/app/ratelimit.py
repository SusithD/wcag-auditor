from __future__ import annotations

import ipaddress
import time
from collections.abc import Callable
from threading import Lock

from fastapi import HTTPException, Request


class TokenBucket:
    def __init__(
        self,
        per_minute: float,
        burst: float | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.rate = per_minute / 60.0
        self.capacity = burst if burst is not None else max(per_minute, 1.0)
        self._clock = clock
        self._state: dict[str, tuple[float, float]] = {}
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = self._clock()
        with self._lock:
            tokens, stamp = self._state.get(key, (self.capacity, now))
            tokens = min(self.capacity, tokens + (now - stamp) * self.rate)
            allowed = tokens >= 1.0
            self._state[key] = (tokens - 1.0 if allowed else tokens, now)
            if len(self._state) > 4096:
                self._state = {k: v for k, v in self._state.items() if v[0] < self.capacity}
            return allowed


IPNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network
IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


def parse_trusted_proxies(raw: str | None) -> tuple[IPNetwork, ...]:
    networks: list[IPNetwork] = []
    for item in (raw or "").split(","):
        entry = item.strip()
        if not entry:
            continue
        try:
            networks.append(ipaddress.ip_network(entry, strict=False))
        except ValueError as exc:
            raise ValueError(f"TRUSTED_PROXIES entry {entry!r} is not an IP or CIDR") from exc
    return tuple(networks)


def _parse_ip(value: str) -> IPAddress | None:
    try:
        return ipaddress.ip_address(value.strip())
    except ValueError:
        return None


def _is_trusted(address: IPAddress, trusted: tuple[IPNetwork, ...]) -> bool:
    return any(address.version == net.version and address in net for net in trusted)


def client_key(request: Request, trusted: tuple[IPNetwork, ...] = ()) -> str:
    peer = request.client.host if request.client else "unknown"
    peer_ip = _parse_ip(peer)
    if not trusted or peer_ip is None or not _is_trusted(peer_ip, trusted):
        return peer
    hops = [
        hop
        for line in request.headers.getlist("x-forwarded-for")
        for hop in line.split(",")
        if hop.strip()
    ]
    for hop in reversed(hops):
        address = _parse_ip(hop)
        if address is None:
            return peer
        if not _is_trusted(address, trusted):
            return str(address)
    return peer


def rate_key(request: Request, trusted: tuple[IPNetwork, ...] = ()) -> str:
    user = getattr(request.state, "user", None)
    if user is not None:
        return f"user:{user.email.lower()}"
    return client_key(request, trusted)


def limiter(
    bucket: TokenBucket, message: str, trusted: tuple[IPNetwork, ...] = ()
) -> Callable[[Request], None]:
    def check(request: Request) -> None:
        if bucket.rate > 0 and not bucket.allow(rate_key(request, trusted)):
            raise HTTPException(429, message, headers={"Retry-After": "60"})

    return check
