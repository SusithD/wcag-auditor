from pathlib import Path
from typing import Any, cast

from test_runs_api import REAL, client, wait_for_terminal


def finished_run(c) -> str:  # type: ignore[no-untyped-def]
    run_id = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
    assert wait_for_terminal(c, run_id)["status"] == "done"
    return str(run_id)


def test_overview_findings_filters_patch_and_assets(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        run_id = finished_run(c)
        ov = c.get(f"/runs/{run_id}/overview", params={"viewport": "mobile"}).json()
        assert ov["viewport"] == "mobile" and ov["screenshot_width"] > 0
        assert ov["focus_stops"] == 15 and len(ov["coverage"]) == 8
        assert ov["condition"] == "hybrid" and ov["available_viewports"] == ["mobile"]

        allf = c.get(f"/runs/{run_id}/findings", params={"viewport": "mobile"}).json()
        assert len(allf) == 18 and {f["key"] for f in allf} == {f"f{i:03d}" for i in range(1, 19)}
        first = allf[0]
        assert first["guidance"]["understanding"].startswith("https://www.w3.org/")
        assert first["evidence_rows"] and first["element"] and first["status"] == "open"

        only = c.get(
            f"/runs/{run_id}/findings",
            params={"viewport": "mobile", "sc": "2.4.13,2.4.11", "tier": "automated"},
        ).json()
        assert only and all(
            f["sc"] in {"2.4.13", "2.4.11"} and f["tier"] == "automated" for f in only
        )

        patched = c.patch(f"/findings/{first['id']}", json={"status": "fixed"})
        assert patched.status_code == 200 and patched.json()["status"] == "fixed"
        again = c.get(f"/runs/{run_id}/findings", params={"viewport": "mobile"}).json()
        assert next(f for f in again if f["id"] == first["id"])["status"] == "fixed"
        assert c.patch(f"/findings/{first['id']}", json={"status": "bogus"}).status_code == 422
        assert c.patch("/findings/999999", json={"status": "open"}).status_code == 404

        crop = c.get(f"/runs/{run_id}/assets/mobile/crop/{first['key']}")
        assert crop.status_code == 200 and crop.headers["content-type"] == "image/png"
        assert c.get(f"/runs/{run_id}/assets/mobile/crop/..%2Freport").status_code == 404
        assert c.get(f"/runs/{run_id}/assets/mobile/crop/fabc").status_code == 404
        on = c.get(f"/runs/{run_id}/assets/mobile/focus/1/on")
        off = c.get(f"/runs/{run_id}/assets/mobile/focus/1/off")
        assert on.status_code == off.status_code == 200
        assert c.get(f"/runs/{run_id}/assets/mobile/focus/99/on").status_code == 404
        assert c.get(f"/runs/{run_id}/assets/mobile/focus/-1/on").status_code == 404

        exports = {
            e["format"]: e
            for e in c.get(f"/runs/{run_id}/exports", params={"viewport": "mobile"}).json()
        }
        assert set(exports) == {"json", "html", "csv"} and exports["html"]["size_bytes"] > 1000
        csv_text = c.get(f"/runs/{run_id}/report.csv", params={"viewport": "mobile"})
        assert csv_text.status_code == 200 and csv_text.text.splitlines()[0].startswith(
            "id,sc,severity"
        )
        assert len(csv_text.text.strip().splitlines()) == 19


def test_report_endpoints_404_before_the_run_has_a_report(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        run_id = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        c.post(f"/runs/{run_id}/cancel")
        assert c.get(f"/runs/{'0' * 32}/overview", params={"viewport": "mobile"}).status_code == 404
        assert c.get("/runs/zz/findings", params={"viewport": "mobile"}).status_code == 404
        wait_for_terminal(c, run_id)


def test_statuses_survive_a_second_ingest_and_foreign_ids_are_isolated(tmp_path: Path) -> None:
    from app.ingest import ingest_run

    with client(tmp_path) as c:
        run_a = finished_run(c)
        run_b = finished_run(c)
        fa = c.get(f"/runs/{run_a}/findings", params={"viewport": "mobile"}).json()
        fb = c.get(f"/runs/{run_b}/findings", params={"viewport": "mobile"}).json()
        assert fa[0]["key"] == fb[0]["key"] and fa[0]["id"] != fb[0]["id"]
        for status in ("fixed", "unsure", "open", "fixed"):
            assert (
                c.patch(f"/findings/{fa[0]['id']}", json={"status": status}).json()["status"]
                == status
            )
        with cast(Any, c.app).state.sessions() as session:
            ingest_run(session, run_a, tmp_path / "runs" / run_a)
        again = c.get(f"/runs/{run_a}/findings", params={"viewport": "mobile"}).json()
        assert again[0]["status"] == "fixed" and again[0]["key"] == fa[0]["key"]
        other = c.get(f"/runs/{run_b}/findings", params={"viewport": "mobile"}).json()
        assert all(f["status"] == "open" for f in other)


def test_csv_neutralises_spreadsheet_formulas_and_quotes_special_characters() -> None:
    from app.report_api import _csv_cell

    assert _csv_cell("=SUM(A1)") == "'=SUM(A1)"
    assert _csv_cell("@cmd") == "'@cmd" and _csv_cell("-2+3") == "'-2+3"
    assert _csv_cell("plain") == "plain" and _csv_cell(3.5) == 3.5


def test_csv_content_matches_the_findings_and_downloads_work(tmp_path: Path) -> None:
    import csv
    import io

    with client(tmp_path) as c:
        run_id = finished_run(c)
        rows = list(
            csv.DictReader(
                io.StringIO(c.get(f"/runs/{run_id}/report.csv", params={"viewport": "mobile"}).text)
            )
        )
        findings = c.get(f"/runs/{run_id}/findings", params={"viewport": "mobile"}).json()
        assert [r["id"] for r in rows] == [f["key"] for f in findings]
        assert {r["sc"] for r in rows} == {f["sc"] for f in findings}
        for ext, kind in (("json", "application/json"), ("html", "text/html")):
            r = c.get(f"/runs/{run_id}/report.{ext}", params={"viewport": "mobile"})
            assert r.status_code == 200 and r.headers["content-type"].startswith(kind)
        assert c.get(f"/runs/{run_id}/exports", params={"viewport": "tablet"}).status_code == 422


def test_findings_are_ingested_lazily_when_the_finish_hook_missed_them(tmp_path: Path) -> None:
    from app.models import CaptureRow
    from sqlalchemy import delete

    with client(tmp_path) as c:
        run_id = finished_run(c)
        with cast(Any, c.app).state.sessions() as session:
            session.execute(delete(CaptureRow).where(CaptureRow.run_id == run_id))
            session.commit()
        rows = c.get(f"/runs/{run_id}/findings", params={"viewport": "mobile"})
        assert rows.status_code == 200 and len(rows.json()) == 18


def test_decisions_record_who_when_and_dismissal_needs_a_reason(tmp_path: Path) -> None:
    with client(tmp_path, decided_by_name="Sam") as c:
        run_id = finished_run(c)
        first = c.get(f"/runs/{run_id}/findings", params={"viewport": "mobile"}).json()[0]
        assert first["decision"]["status"] == "open" and first["decision"]["decided_at"] is None
        url = f"/findings/{first['id']}"
        assert c.patch(url, json={"status": "dismissed"}).status_code == 422
        assert c.patch(url, json={"status": "dismissed", "reason": "  "}).status_code == 422
        assert c.patch(url, json={"status": "ignored"}).status_code == 422
        done = c.patch(url, json={"status": "dismissed", "reason": "Decorative", "note": "ok"})
        body = done.json()
        assert done.status_code == 200 and body["status"] == "dismissed"
        assert body["decision"]["reason"] == "Decorative" and body["decision"]["note"] == "ok"
        assert body["decision"]["decided_by"] == "Sam"
        assert body["decision"]["decided_at"].endswith(("Z", "+00:00"))
        confirmed = c.patch(url, json={"status": "confirmed"}).json()
        assert confirmed["decision"]["reason"] is None and confirmed["decision"]["decided_at"]
        reopened = c.patch(url, json={"status": "open", "reason": "x"}).json()
        assert reopened["decision"] == {
            "status": "open",
            "reason": None,
            "note": None,
            "decided_at": None,
            "decided_by": None,
        }
        assert first["needs_review_reason"] is None or isinstance(first["needs_review_reason"], str)
