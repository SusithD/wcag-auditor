import json
from pathlib import Path
from typing import Any

import pytest
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
REAL = sorted(FIXTURES.glob("real/real_com_011_mobile_*"))[0]
SECRET = "s3cr3t-value-123"


def client(tmp_path: Path, **over: Any) -> TestClient:
    settings = Settings(
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        folder_roots=(FIXTURES.resolve(),),
        pdf=False,
        **over,
    )
    return TestClient(create_app(settings))


def capture_jobs(c: TestClient) -> list[Any]:
    jobs: list[Any] = []
    c.app.state.jobs.submit = jobs.append  # type: ignore[attr-defined]
    return jobs


def test_verify_in_browser_adds_the_flags_for_url_runs(tmp_path: Path) -> None:
    with client(tmp_path, verify_timeout_s=120) as c:
        jobs = capture_jobs(c)
        assert (
            c.post("/runs", json={"url": "example.com", "verify_in_browser": True}).status_code
            == 201
        )
        argv = jobs[0].argv
        assert "--verify-in-browser" in argv
        assert argv[argv.index("--verify-timeout-s") + 1] == "120"
        assert argv[argv.index("--profile-dir") + 1] == str(tmp_path.resolve() / "browser-profile")
        assert c.post("/runs", json={"url": "example.com"}).status_code == 201
        assert "--verify-in-browser" not in jobs[1].argv


def test_verify_in_browser_is_refused_for_runs_without_a_page(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        capture_jobs(c)
        res = c.post("/runs", json={"folder": str(REAL), "verify_in_browser": True})
        assert res.status_code == 422
        assert "web address" in res.json()["detail"]


def test_extra_headers_reach_the_job_environment_but_not_the_run_record(tmp_path: Path) -> None:
    with client(tmp_path, extra_headers_json=json.dumps({"X-Audit-Key": SECRET})) as c:
        jobs = capture_jobs(c)
        run_id = c.post("/runs", json={"url": "example.com"}).json()["run_id"]
        job = jobs[0]
        assert json.loads(job.env["AUDIT_EXTRA_HEADERS"]) == {"X-Audit-Key": SECRET}
        assert SECRET not in repr(job)
        assert SECRET not in c.get(f"/runs/{run_id}").text
        assert SECRET not in c.get("/runs").text


def test_settings_expose_only_header_names(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUDIT_EXTRA_HEADERS", json.dumps({"X-Audit-Key": SECRET}))
    settings = Settings.from_env()
    assert settings.extra_header_names == ["X-Audit-Key"]
    assert SECRET not in repr(settings)
    monkeypatch.setenv("AUDIT_EXTRA_HEADERS", "[1]")
    with pytest.raises(ValueError, match="AUDIT_EXTRA_HEADERS"):
        Settings.from_env()


def test_waiting_event_streams_to_the_client(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        capture_jobs(c)
        run_id = c.post("/runs", json={"url": "example.com", "verify_in_browser": True}).json()[
            "run_id"
        ]
        events = tmp_path / "runs" / run_id / "events.jsonl"
        events.write_text(
            json.dumps({"ts": 1, "stage": "waiting:verify", "viewport": "desktop", "detail": "240"})
            + "\n"
            + json.dumps({"ts": 2, "stage": "failed:run", "viewport": None, "detail": None})
            + "\n"
        )
        (tmp_path / "runs" / run_id / "summary.json").write_text(
            json.dumps({"status": "failed", "viewports": {}, "errors": {}})
        )
        from app.models import Run

        with c.app.state.sessions() as session:  # type: ignore[attr-defined]
            row = session.get(Run, run_id)
            row.status = "failed"
            session.commit()
        with c.stream("GET", f"/runs/{run_id}/events") as res:
            body = "".join(res.iter_text())
        assert '"stage": "waiting:verify"' in body and '"detail": "240"' in body
