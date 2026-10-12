from __future__ import annotations

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


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def limiter(bucket: TokenBucket, message: str) -> Callable[[Request], None]:
    def check(request: Request) -> None:
        if bucket.rate > 0 and not bucket.allow(client_key(request)):
            raise HTTPException(429, message, headers={"Retry-After": "60"})

    return check
