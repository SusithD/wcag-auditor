import io
import os
from pathlib import Path
from typing import Any, cast

import pytest
from app.config import Settings
from app.main import create_app
from app.models import Run
from auditor import netguard
from fastapi import APIRouter
from fastapi.testclient import TestClient
from PIL import Image

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
PRIVATE_MESSAGE = (
    "That address points to a private or local network, which this server does not audit."
)


def client(tmp_path: Path, **over: Any) -> TestClient:
    settings = Settings(
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        folder_roots=over.pop("folder_roots", ()),
        pdf=False,
        **over,
    )
    return TestClient(create_app(settings), raise_server_exceptions=False)


def fake_dns(monkeypatch: pytest.MonkeyPatch, mapping: dict[str, list[str]]) -> None:
    def resolve(host: str) -> list[str]:
        if host in mapping:
            return mapping[host]
        raise OSError("unknown host")

    monkeypatch.setattr(netguard, "system_resolver", resolve)


@pytest.mark.parametrize(
    "target",
    [
        "http://127.0.0.1/",
        "http://localhost:8000/",
        "http://10.0.0.1/",
        "http://172.16.5.5/",
        "http://192.168.0.10/",
        "http://169.254.169.254/latest/meta-data/",
        "http://100.64.1.1/",
        "http://224.0.0.1/",
        "http://240.0.0.1/",
        "http://0.0.0.0/",
        "http://[::1]/",
        "http://[fd00::1]/",
        "http://[fe80::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://rebind.example/",
        "http://metadata.example/",
    ],
)
def test_private_targets_are_rejected(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, target: str
) -> None:
    fake_dns(
        monkeypatch,
        {
            "localhost": ["127.0.0.1", "::1"],
            "127.0.0.1": ["127.0.0.1"],
            "10.0.0.1": ["10.0.0.1"],
            "172.16.5.5": ["172.16.5.5"],
            "192.168.0.10": ["192.168.0.10"],
            "169.254.169.254": ["169.254.169.254"],
            "100.64.1.1": ["100.64.1.1"],
            "224.0.0.1": ["224.0.0.1"],
            "240.0.0.1": ["240.0.0.1"],
            "0.0.0.0": ["0.0.0.0"],
            "::1": ["::1"],
            "fd00::1": ["fd00::1"],
            "fe80::1": ["fe80::1"],
            "::ffff:127.0.0.1": ["::ffff:127.0.0.1"],
            "rebind.example": ["93.184.216.34", "10.0.0.7"],
            "metadata.example": ["169.254.169.254"],
        },
    )
    with client(tmp_path, allow_private_targets_override=False) as c:
        resp = c.post("/runs", json={"url": target})
        assert resp.status_code == 422
        assert resp.json()["detail"] == PRIVATE_MESSAGE
        assert c.get("/runs").json() == []


def test_public_targets_pass_the_guard_and_unknown_hosts_are_reported(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_dns(monkeypatch, {"ok.example": ["93.184.216.34", "2606:4700::1111"]})
    with client(tmp_path, allow_private_targets_override=False, max_queued_runs=0) as c:
        assert c.post("/runs", json={"url": "ok.example"}).status_code == 429
        missing = c.post("/runs", json={"url": "nowhere.example"})
        assert missing.status_code == 422
        assert "could not be found" in missing.json()["detail"]
        assert c.post("/runs", json={"url": "ftp://ok.example"}).status_code == 422
        assert c.post("/runs", json={"url": "file:///etc/passwd"}).status_code == 422


def test_private_targets_allowed_when_configured(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_dns(monkeypatch, {})
    with client(tmp_path, allow_private_targets_override=True, max_queued_runs=0) as c:
        assert c.post("/runs", json={"url": "http://127.0.0.1:1/"}).status_code == 429


def test_settings_defaults_follow_app_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("FOLDER_ROOTS", "ALLOW_PRIVATE_TARGETS", "STUDY_ADMIN_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("INTERNAL_API_TOKEN", "t")
    prod = Settings.from_env()
    assert prod.production
    assert prod.folder_roots == ()
    assert not prod.allow_private_targets
    assert prod.study_admin_token is None
    monkeypatch.setenv("APP_ENV", "development")
    dev = Settings.from_env()
    assert dev.folder_roots
    assert dev.allow_private_targets
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("ALLOW_PRIVATE_TARGETS", "1")
    monkeypatch.setenv("FOLDER_ROOTS", os.fspath(FIXTURES))
    monkeypatch.setenv("STUDY_ADMIN_TOKEN", "   ")
    override = Settings.from_env()
    assert override.allow_private_targets
    assert override.folder_roots == (FIXTURES.resolve(),)
    assert override.study_admin_token is None
    monkeypatch.setenv("APP_ENV", "staging")
    with pytest.raises(ValueError, match="APP_ENV"):
        Settings.from_env()


def test_folder_runs_are_disabled_without_roots(tmp_path: Path) -> None:
    folder = next(FIXTURES.glob("real/*"))
    with client(tmp_path) as c:
        for body in (str(folder), str(folder / ".."), "/etc", "/", str(tmp_path)):
            resp = c.post("/runs", json={"folder": body})
            assert resp.status_code == 422
            assert "not an allowed capture folder" in resp.json()["detail"]


def test_folder_traversal_and_symlink_escapes_are_rejected(tmp_path: Path) -> None:
    root = tmp_path / "root"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "meta.json").write_text('{"viewport": "desktop"}')
    (root / "link").symlink_to(outside, target_is_directory=True)
    with client(tmp_path / "data", folder_roots=(root.resolve(),)) as c:
        for body in (
            str(root / ".." / "outside"),
            str(root / "link"),
            str(root / "link" / ".." / "outside"),
            f"{root}/../outside",
            f"{root}sibling",
        ):
            assert c.post("/runs", json={"folder": body}).status_code == 422


def png(size: tuple[int, int] = (50, 40)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, "white").save(buf, "PNG")
    return buf.getvalue()


def test_upload_accepts_real_images_and_rejects_disguised_files(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        ok = c.post("/uploads", files=[("files", ("shot.png", png(), "image/png"))])
        assert ok.status_code == 200
        script = c.post(
            "/uploads", files=[("files", ("shot.png", b"<script>1</script>", "image/png"))]
        )
        assert script.status_code == 422
        assert "PNG, JPEG or WebP" in script.json()["detail"]
        gif = io.BytesIO()
        Image.new("RGB", (5, 5)).save(gif, "GIF")
        assert (
            c.post(
                "/uploads", files=[("files", ("a.png", gif.getvalue(), "image/png"))]
            ).status_code
            == 422
        )
        wrong_ext = c.post("/uploads", files=[("files", ("notes.txt", png(), "text/plain"))])
        assert wrong_ext.status_code == 200
        assert list((tmp_path / "uploads").glob("*")) != []


def test_upload_failures_leave_no_files_behind(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        bad = c.post("/uploads", files=[("files", ("x.png", b"nope", "image/png"))])
        assert bad.status_code == 422
        assert list((tmp_path / "uploads").glob("*")) == []


def test_upload_size_and_count_limits(tmp_path: Path) -> None:
    with client(tmp_path, max_upload_bytes=1000, max_upload_files=2) as c:
        noisy = io.BytesIO()
        Image.frombytes("RGB", (60, 60), os.urandom(60 * 60 * 3)).save(noisy, "PNG")
        big = c.post("/uploads", files=[("files", ("big.png", noisy.getvalue(), "image/png"))])
        assert big.status_code == 413
        many = [("files", (f"{i}.png", png((5, 5)), "image/png")) for i in range(3)]
        assert c.post("/uploads", files=many).status_code == 422


def test_run_rate_limit_returns_429(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    fake_dns(monkeypatch, {"ok.example": ["93.184.216.34"]})
    with client(tmp_path, allow_private_targets_override=False, runs_per_minute=2) as c:
        codes = [c.post("/runs", json={"url": "http://127.0.0.1/"}).status_code for _ in range(4)]
        assert codes[:2] == [422, 422]
        assert codes[2:] == [429, 429]
        limited = c.post("/runs", json={"url": "ok.example"})
        assert limited.status_code == 429
        assert "Too many audits" in limited.json()["detail"]


def test_queue_cap_returns_429(tmp_path: Path) -> None:
    folder = next(FIXTURES.glob("real/real_com_011_mobile_*"))
    with client(tmp_path, folder_roots=(FIXTURES.resolve(),), max_queued_runs=1) as c:
        with cast(Any, c.app).state.sessions() as session:
            session.add(
                Run(
                    id="a" * 32,
                    source_kind="url",
                    source="https://x",
                    viewports=["desktop"],
                    condition="hybrid",
                    status="running",
                    stage_status={},
                    max_focus_steps=15,
                )
            )
            session.commit()
        resp = c.post("/runs", json={"folder": str(folder)})
        assert resp.status_code == 429
        assert "queue is full" in resp.json()["detail"]
        assert not (tmp_path / "runs").exists() or list((tmp_path / "runs").glob("*")) == []


def test_token_bucket_refills() -> None:
    from app.ratelimit import TokenBucket

    now = [0.0]
    bucket = TokenBucket(60, burst=2, clock=lambda: now[0])
    assert bucket.allow("k") and bucket.allow("k")
    assert not bucket.allow("k")
    assert bucket.allow("other")
    now[0] = 1.0
    assert bucket.allow("k")
    assert not bucket.allow("k")


def test_study_endpoints_are_rate_limited(tmp_path: Path) -> None:
    with client(
        tmp_path, study_per_minute=3, study_dir=Path(__file__).resolve().parents[3] / "study"
    ) as c:
        codes = [c.get("/study/sessions/P01").status_code for _ in range(5)]
        assert codes[-1] == 429
        assert 429 not in codes[:3]


def test_study_admin_is_closed_without_a_token_and_constant_time(tmp_path: Path) -> None:
    study = Path(__file__).resolve().parents[3] / "study"
    with client(
        tmp_path,
        study_dir=study,
        study_admin_token=None,
        app_env="production",
        require_internal_token_override=False,
    ) as c:
        assert c.get("/study/admin/tasks", headers={"x-study-token": ""}).status_code == 403
        assert c.get("/study/admin/tasks").status_code == 403
    with client(tmp_path / "b", study_dir=study, study_admin_token="secret") as c:
        assert c.get("/study/admin/tasks", headers={"x-study-token": "wrong"}).status_code == 403
        assert c.get("/study/admin/tasks", headers={"x-study-token": "secret"}).status_code == 200


def test_unhandled_errors_return_a_generic_500(tmp_path: Path) -> None:
    with client(tmp_path, app_env="production", require_internal_token_override=False) as c:
        boom = APIRouter()

        @boom.get("/boom")
        def explode() -> None:
            raise RuntimeError("secret internals /etc/passwd")

        c.app.include_router(boom)  # type: ignore[attr-defined]
        resp = c.get("/boom")
        assert resp.status_code == 500
        assert resp.json() == {"detail": "Internal server error"}
        assert "secret" not in resp.text
        assert "Traceback" not in resp.text


def test_docs_are_hidden_in_production(tmp_path: Path) -> None:
    with client(tmp_path, app_env="production", require_internal_token_override=False) as c:
        assert c.get("/docs").status_code == 404
        assert c.get("/openapi.json").status_code == 404
    with client(tmp_path / "dev") as c:
        assert c.get("/openapi.json").status_code == 200


def _request(peer: str, *forwarded: str) -> Any:
    from starlette.requests import Request

    scope = {
        "type": "http",
        "client": (peer, 40000),
        "headers": [(b"x-forwarded-for", value.encode()) for value in forwarded],
    }
    return Request(scope)


def test_spoofed_forwarded_for_from_an_untrusted_peer_is_ignored() -> None:
    from app.ratelimit import client_key, parse_trusted_proxies

    trusted = parse_trusted_proxies("172.16.0.0/12")
    assert client_key(_request("203.0.113.9", "1.2.3.4"), trusted) == "203.0.113.9"
    assert client_key(_request("203.0.113.9", "1.2.3.4")) == "203.0.113.9"


def test_trusted_peer_uses_the_right_most_untrusted_hop() -> None:
    from app.ratelimit import client_key, parse_trusted_proxies

    trusted = parse_trusted_proxies("172.16.0.0/12, fd00::/8")
    peer = "172.18.0.4"
    assert client_key(_request(peer, "198.51.100.7"), trusted) == "198.51.100.7"
    assert client_key(_request(peer, "6.6.6.6, 198.51.100.7, 172.18.0.3"), trusted) == (
        "198.51.100.7"
    )
    assert client_key(_request(peer, "6.6.6.6", "198.51.100.7"), trusted) == "198.51.100.7"
    assert client_key(_request(peer), trusted) == peer
    assert client_key(_request(peer, "garbage"), trusted) == peer
    assert client_key(_request("fd00::5", "2001:db8::1"), trusted) == "2001:db8::1"


def test_invalid_trusted_proxies_entry_fails_at_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRUSTED_PROXIES", "172.16.0.0/12,not-an-ip")
    with pytest.raises(ValueError, match="TRUSTED_PROXIES"):
        Settings.from_env()
    monkeypatch.setenv("TRUSTED_PROXIES", "")
    assert Settings.from_env().trusted_proxies == ()


def test_clients_behind_the_proxy_get_separate_buckets(tmp_path: Path) -> None:
    from app.ratelimit import parse_trusted_proxies

    study = Path(__file__).resolve().parents[3] / "study"
    settings = Settings(
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        pdf=False,
        study_per_minute=2,
        study_dir=study,
        trusted_proxies=parse_trusted_proxies("172.16.0.0/12"),
    )
    with TestClient(
        create_app(settings), client=("172.18.0.4", 50000), raise_server_exceptions=False
    ) as c:

        def hit(ip: str) -> int:
            return c.get("/study/sessions/P01", headers={"x-forwarded-for": ip}).status_code

        assert [hit("198.51.100.1") for _ in range(3)][-1] == 429
        assert hit("198.51.100.2") != 429
