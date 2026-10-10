from pathlib import Path

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


def test_report_endpoints_404_before_the_run_has_a_report(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        run_id = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        c.post(f"/runs/{run_id}/cancel")
        assert c.get(f"/runs/{'0' * 32}/overview", params={"viewport": "mobile"}).status_code == 404
        assert c.get("/runs/zz/findings", params={"viewport": "mobile"}).status_code == 404
        wait_for_terminal(c, run_id)
