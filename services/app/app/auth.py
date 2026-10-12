from __future__ import annotations

import hmac
import re
from dataclasses import dataclass

from fastapi import HTTPException, Request

from app.config import Settings

EMAIL_HEADER = "x-wcag-user-email"
NAME_HEADER = "x-wcag-user-name"
TOKEN_HEADER = "x-wcag-internal-token"
MAX_FIELD = 200

EXEMPT_ANY = re.compile(r"^/study/(materials|config|sessions)(/.*)?$")
EXEMPT_GET = re.compile(r"^/runs/[0-9a-f]{32}/.+$")


@dataclass(frozen=True)
class User:
    email: str
    name: str | None

    @property
    def display_name(self) -> str:
        return self.name or self.email


def _clean(value: str | None) -> str:
    return (value or "").strip()[:MAX_FIELD]


def resolve_user(request: Request, settings: Settings) -> User | None:
    expected = settings.internal_api_token
    presented = request.headers.get(TOKEN_HEADER)
    if not expected or not presented:
        return None
    if not hmac.compare_digest(presented.encode(), expected.encode()):
        return None
    email = _clean(request.headers.get(EMAIL_HEADER))
    if not email:
        return None
    return User(email=email, name=_clean(request.headers.get(NAME_HEADER)) or None)


def is_exempt(method: str, path: str) -> bool:
    if path == "/health":
        return True
    if EXEMPT_ANY.match(path):
        return True
    return method in {"GET", "HEAD"} and EXEMPT_GET.match(path) is not None


def current_user(request: Request) -> User | None:
    user: User | None = getattr(request.state, "user", None)
    return user


def authenticate(settings: Settings):  # type: ignore[no-untyped-def]
    def dependency(request: Request) -> None:
        request.state.user = resolve_user(request, settings)
        if (
            settings.require_internal_token
            and request.state.user is None
            and not is_exempt(request.method, request.url.path)
        ):
            raise HTTPException(401, "Sign in required")

    return dependency
