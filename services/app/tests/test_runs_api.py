import io
import json
import time
from pathlib import Path

import pytest
from app.api import normalise_url
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient
from PIL import Image

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"
REAL = sorted(FIXTURES.glob("real/real_com_011_mobile_*"))[0]


def client(tmp_path: Path, **over: object) -> TestClient:
    settings = Settings(
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        folder_roots=(FIXTURES.resolve(),),
        pdf=False,
        **over,  # type: ignore[arg-type]
    )
    return TestClient(create_app(settings))


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("example.com", "https://example.com"),
        ("  http://example.com/a?b=1 ", "http://example.com/a?b=1"),
        ("https://example.com", "https://example.com"),
    ],
)
def test_url_normalisation(raw: str, expected: str) -> None:
    assert normalise_url(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", "ftp://example.com", "https://", "javascript:alert(1)"])
def test_url_normalisation_rejects_bad_input(raw: str) -> None:
    with pytest.raises(ValueError, match="web address"):
        normalise_url(raw)


def test_create_run_validates_the_source(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        assert c.post("/runs", json={}).status_code == 422
        assert c.post("/runs", json={"url": "a.com", "folder": "x"}).status_code == 422
        assert c.post("/runs", json={"url": "ftp://x"}).status_code == 422
        assert c.post("/runs", json={"folder": str(tmp_path)}).status_code == 422
        assert c.post("/runs", json={"folder": "/etc"}).status_code == 422
        assert c.post("/runs", json={"upload_id": "../../etc"}).status_code == 404
        assert c.post("/runs", json={"url": "a.com", "viewports": []}).status_code == 422
        assert c.get("/runs/not-a-run").status_code == 404
        assert c.get("/runs/" + "0" * 32).status_code == 404


def wait_for_terminal(c: TestClient, run_id: str, seconds: float = 120) -> dict[str, object]:
    deadline = time.time() + seconds
    while time.time() < deadline:
        body = c.get(f"/runs/{run_id}").json()
        if body["status"] in {"done", "failed", "partial", "cancelled"}:
            return body  # type: ignore[no-any-return]
        time.sleep(0.5)
    raise AssertionError("run did not finish")


def test_a_folder_run_streams_progress_and_serves_the_report(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        run_id = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        with c.stream("GET", f"/runs/{run_id}/events") as stream:
            text = "".join(stream.iter_text())
        stages = [
            json.loads(line[6:])["stage"] for line in text.splitlines() if line.startswith("data: ")
        ]
        assert stages[0] == "queued" and stages[-1] == "done"
        assert "captured:mobile" in stages and "fusion" in stages and "report" in stages
        assert [s for s in stages if s.startswith("module:")] == [
            f"module:{sc}"
            for sc in ("1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8")
        ]
        body = wait_for_terminal(c, run_id)
        assert body["status"] == "done" and body["available_viewports"] == ["mobile"]
        shot = c.get(f"/runs/{run_id}/assets/mobile/screenshot")
        assert shot.status_code == 200 and shot.headers["content-type"] == "image/png"
        report = c.get(f"/runs/{run_id}/report.json", params={"viewport": "mobile"})
        assert report.status_code == 200 and report.json()["condition"] == "hybrid"
        assert (
            c.get(f"/runs/{run_id}/report.html", params={"viewport": "mobile"}).status_code == 200
        )
        assert c.get(f"/runs/{run_id}/report.pdf", params={"viewport": "mobile"}).status_code == 404
        assert c.get("/runs").json()[0]["id"] == run_id


def png(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (250, 250, 250)).save(buf, format="PNG")
    return buf.getvalue()


def test_uploads_are_validated_and_audited_without_a_dom(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        assert (
            c.post("/uploads", files=[("files", ("a.txt", b"hello", "text/plain"))]).status_code
            == 422
        )
        two = [
            ("files", ("a.png", png(390, 600), "image/png")),
            ("files", ("b.png", png(300, 500), "image/png")),
        ]
        assert c.post("/uploads", files=two).status_code == 422
        ok = c.post("/uploads", files=[("files", ("page.png", png(1440, 900), "image/png"))])
        assert ok.status_code == 200 and ok.json()["viewports"] == ["desktop"]
        run_id = c.post(
            "/runs", json={"upload_id": ok.json()["upload_id"], "viewports": ["desktop"]}
        ).json()["run_id"]
        body = wait_for_terminal(c, run_id)
        assert body["status"] == "done", body
        report = c.get(f"/runs/{run_id}/report.json", params={"viewport": "desktop"}).json()
        assert report["stage_status"]["rules"] == "skipped"
        cells = {x["sc"]: x for x in report["coverage"]["cells"]}
        assert cells["1.4.3"]["rule_verdict"] == "none"


def test_cancel_a_queued_run(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        first = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        second = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        assert c.post(f"/runs/{second}/cancel").json() == {"cancelled": True}
        assert wait_for_terminal(c, second)["status"] == "cancelled"
        assert wait_for_terminal(c, first)["status"] == "done"
