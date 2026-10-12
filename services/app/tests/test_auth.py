from pathlib import Path
from typing import Any

import pytest
from app.config import Settings
from app.main import create_app
from app.ratelimit import TokenBucket, limiter
from fastapi import Request
from fastapi.testclient import TestClient

TOKEN = "s3cret-internal-token"
USER = {"X-Wcag-User-Email": "ada@example.com", "X-Wcag-User-Name": "Ada Lovelace"}
RUN = "a" * 32


def client(tmp_path: Path, **over: Any) -> TestClient:
    over.setdefault("internal_api_token", TOKEN)
    over.setdefault("require_internal_token_override", True)
    settings = Settings(
        data_dir=tmp_path, db_url=f"sqlite:///{tmp_path / 'app.db'}", pdf=False, **over
    )
    return TestClient(create_app(settings), raise_server_exceptions=False)


def signed(**extra: str) -> dict[str, str]:
    return {**USER, "X-Wcag-Internal-Token": TOKEN, **extra}


def test_token_missing_wrong_and_right(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        assert c.get("/runs").status_code == 401
        assert c.get("/runs", headers={**USER, "X-Wcag-Internal-Token": "nope"}).status_code == 401
        assert c.get("/runs", headers=signed()).status_code == 200


def test_spoofed_user_headers_without_token_are_ignored(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        assert c.get("/me", headers=USER).status_code == 401
        assert c.get("/runs", headers=USER).status_code == 401
    with client(tmp_path, require_internal_token_override=False) as c:
        assert c.get("/me", headers=USER).status_code == 401
        assert c.get("/me", headers={**USER, "X-Wcag-Internal-Token": "bad"}).status_code == 401


def test_unset_server_token_never_authenticates(tmp_path: Path) -> None:
    with client(tmp_path, internal_api_token=None, require_internal_token_override=False) as c:
        assert c.get("/me", headers={**USER, "X-Wcag-Internal-Token": ""}).status_code == 401
        assert c.get("/runs").status_code == 200


def test_exempt_paths_work_anonymously_in_production(tmp_path: Path) -> None:
    with client(tmp_path, app_env="production", require_internal_token_override=None) as c:
        assert c.get("/health").status_code == 200
        assert c.get("/study/materials").status_code != 401
        assert c.get("/study/config").status_code != 401
        assert c.get("/study/sessions/P01").status_code != 401
        assert c.post("/study/sessions", json={}).status_code != 401
        assert c.get(f"/runs/{RUN}/overview").status_code != 401
        assert c.get(f"/runs/{RUN}/assets/mobile/screenshot").status_code != 401
        assert c.get(f"/runs/{RUN}/report.json").status_code != 401
        assert c.get(f"/runs/{RUN}").status_code == 401
        assert c.post(f"/runs/{RUN}/cancel").status_code == 401
        assert c.get("/study/admin/runs").status_code == 401
        assert c.post("/study/prepare").status_code == 401
        assert c.get("/runs").status_code == 401
        assert c.get("/eval").status_code == 401
        assert c.patch("/findings/1", json={"status": "open"}).status_code == 401
        assert c.get("/runs/not-hex/overview").status_code == 401


def test_requirement_defaults_follow_the_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("INTERNAL_API_TOKEN", TOKEN)
    monkeypatch.delenv("REQUIRE_INTERNAL_TOKEN", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    assert not Settings.from_env().require_internal_token
    monkeypatch.setenv("APP_ENV", "production")
    assert Settings.from_env().require_internal_token
    monkeypatch.setenv("REQUIRE_INTERNAL_TOKEN", "0")
    assert not Settings.from_env().require_internal_token
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("REQUIRE_INTERNAL_TOKEN", "1")
    assert Settings.from_env().require_internal_token


def test_production_without_a_token_refuses_to_start(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("INTERNAL_API_TOKEN", raising=False)
    monkeypatch.delenv("REQUIRE_INTERNAL_TOKEN", raising=False)
    with pytest.raises(ValueError, match="INTERNAL_API_TOKEN"):
        Settings.from_env()


def test_token_is_not_in_the_settings_repr(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, db_url="sqlite://", internal_api_token=TOKEN)
    assert TOKEN not in repr(settings)


def test_me(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        assert c.get("/me").status_code == 401
        assert c.get("/me", headers=signed()).json() == {
            "email": "ada@example.com",
            "name": "Ada Lovelace",
        }
        only_email = {"X-Wcag-User-Email": "bob@example.com", "X-Wcag-Internal-Token": TOKEN}
        assert c.get("/me", headers=only_email).json() == {"email": "bob@example.com", "name": None}


def test_rate_limit_key_uses_the_user(tmp_path: Path) -> None:
    app = create_app(
        Settings(data_dir=tmp_path, db_url=f"sqlite:///{tmp_path / 'app.db'}", pdf=False)
    )
    check = limiter(TokenBucket(1, burst=1), "slow down")

    def request(email: str | None, host: str) -> Request:
        scope: dict[str, Any] = {"type": "http", "headers": [], "client": (host, 1), "app": app}
        req = Request(scope)
        if email:
            req.state.user = type("U", (), {"email": email})()
        return req

    check(request("ada@example.com", "1.1.1.1"))
    with pytest.raises(Exception, match="429"):
        check(request("ADA@example.com", "2.2.2.2"))
    check(request("bob@example.com", "1.1.1.1"))
    check(request(None, "1.1.1.1"))
    with pytest.raises(Exception, match="429"):
        check(request(None, "1.1.1.1"))
