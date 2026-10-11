from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from app.models import CaptureRow, CoverageRow, FindingRow, Run, StudyRun
from fastapi.testclient import TestClient
from test_runs_api import client

NOW = datetime.now(UTC)


def box(x: float, y: float = 0, w: float = 100, h: float = 20) -> dict[str, float]:
    return {"x": x, "y": y, "w": w, "h": h}


def add_run(
    c: TestClient,
    tmp_path: Path,
    run_id: str,
    source: str,
    findings: list[dict[str, Any]],
    *,
    age_days: float = 0,
    kind: str = "url",
    status: str = "done",
    condition: str = "hybrid",
    verdicts: dict[str, dict[str, dict[str, str]]] | None = None,
) -> None:
    sessions = cast(Any, c.app).state.sessions
    with sessions() as session:
        session.add(
            Run(
                id=run_id,
                created_at=NOW - timedelta(days=age_days),
                source_kind=kind,
                source=source,
                viewports=["desktop", "mobile"],
                condition=condition,
                status=status,
                stage_status={"capture": "running"} if status == "running" else {},
            )
        )
        session.flush()
        captures: dict[str, CaptureRow] = {}
        for f in findings:
            vp = f.get("viewport", "desktop")
            if vp not in captures:
                captures[vp] = CaptureRow(
                    run_id=run_id, viewport=vp, path=str(tmp_path / run_id / vp / "x"), meta={}
                )
                session.add(captures[vp])
                session.flush()
            session.add(
                FindingRow(
                    capture_id=captures[vp].id,
                    key=f["key"],
                    sc=f.get("sc", "1.4.3"),
                    bbox=f.get("bbox"),
                    focus_index=f.get("focus_index"),
                    severity="serious",
                    tier=f.get("tier", "automated"),
                    score=0.9,
                    provenance="rule",
                    evidence=f.get("evidence", {"rule": {"target": [f["key"]]}}),
                    guidance_key="g",
                    status=f.get("status", "open"),
                    decided_at=f.get("decided_at"),
                )
            )
        for vp, cells in (verdicts or {}).items():
            capture = captures.get(vp)
            if capture is None:
                capture = CaptureRow(
                    run_id=run_id, viewport=vp, path=str(tmp_path / run_id / vp / "x"), meta={}
                )
                session.add(capture)
                session.flush()
            for sc, v in cells.items():
                session.add(
                    CoverageRow(
                        capture_id=capture.id,
                        sc=sc,
                        rule_verdict=v.get("rule", "none"),
                        pixel_verdict="none",
                        hybrid_verdict=v.get("hybrid", "none"),
                    )
                )
        session.commit()


def nr(key: str, reason: str | None, **kw: Any) -> dict[str, Any]:
    evidence: dict[str, Any] = {"rule": {"target": [key]}}
    if reason:
        evidence["needs_review_reason"] = reason
    return {"key": key, "tier": "needs-review", "evidence": evidence, **kw}


def test_review_uses_latest_run_per_site_and_filters(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://Example.com/shop/", [nr("old", "r1")], age_days=3)
        add_run(
            c,
            tmp_path,
            "b" * 32,
            "https://example.com/shop",
            [
                nr("n1", "low-confidence", sc="2.4.7"),
                nr("n2", "low-confidence", status="unsure"),
                nr("n3", "no-dom", status="confirmed"),
                nr("n4", None, status="dismissed"),
                {"key": "auto", "tier": "automated"},
            ],
            age_days=1,
        )
        add_run(c, tmp_path, "c" * 32, "/fixtures/p", [nr("m1", "no-dom")], kind="folder")
        add_run(c, tmp_path, "d" * 32, "https://other.com", [nr("x", "r1")], status="failed")
        waiting = c.get("/review").json()
        keys = {i["finding"]["key"] for i in waiting["items"]}
        assert keys == {"n1", "n2", "m1"} and waiting["total"] == 3
        assert {(r["reason"], r["count"]) for r in waiting["counts_by_reason"]} == {
            ("low-confidence", 2),
            ("no-dom", 1),
        }
        item = next(i for i in waiting["items"] if i["finding"]["key"] == "n1")
        assert item["run_id"] == "b" * 32 and item["site"] == "example.com/shop"
        assert item["viewport"] == "desktop" and item["finding"]["needs_review_reason"] == (
            "low-confidence"
        )
        decided = c.get("/review", params={"state": "decided"}).json()
        assert {i["finding"]["key"] for i in decided["items"]} == {"n3", "n4"}
        assert {
            i["finding"]["key"] for i in c.get("/review", params={"state": "all"}).json()["items"]
        } == {"n1", "n2", "n3", "n4", "m1"}
        only = c.get("/review", params={"reason": "no-dom", "state": "all"}).json()
        assert {i["finding"]["key"] for i in only["items"]} == {"n3", "m1"}
        assert len(only["counts_by_reason"]) == 3 and only["total"] == 2
        by_sc = c.get("/review", params={"sc": "2.4.7"}).json()
        assert [i["finding"]["key"] for i in by_sc["items"]] == ["n1"]
        by_site = c.get("/review", params={"site": "example.com/shop"}).json()
        assert by_site["total"] == 2
        page = c.get("/review", params={"limit": 1, "offset": 1}).json()
        assert len(page["items"]) == 1 and page["total"] == 3
        assert c.get("/review", params={"state": "bogus"}).status_code == 422


def test_review_excludes_study_runs(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://s.com", [nr("n1", "r")])
        with cast(Any, c.app).state.sessions() as session:
            session.add(StudyRun(task_id="t", condition="hybrid", run_id="a" * 32))
            session.commit()
        assert c.get("/review").json()["total"] == 0
        assert c.get("/sites").json() == []


def test_delta_matches_by_element_iou_and_focus_index(tmp_path: Path) -> None:
    prev_id, cur_id = "a" * 32, "b" * 32
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            prev_id,
            "https://x.com/",
            [
                {"key": "p1", "evidence": {"rule": {"target": ["#a"]}}, "bbox": box(0)},
                {"key": "p2", "evidence": {}, "bbox": box(0, 100)},
                {"key": "p3", "evidence": {}, "bbox": box(0, 200), "status": "fixed"},
                {"key": "p4", "sc": "2.4.7", "focus_index": 3, "evidence": {}},
                {"key": "p5", "sc": "2.4.7", "focus_index": 4, "evidence": {}, "status": "fixed"},
                {"key": "p6", "viewport": "mobile", "evidence": {"rule": {"target": ["#m"]}}},
                {"key": "p7", "evidence": {"rule": {"target": ["#gone"]}}, "status": "fixed"},
            ],
            age_days=2,
        )
        add_run(
            c,
            tmp_path,
            cur_id,
            "https://x.com",
            [
                {"key": "c1", "evidence": {"rule": {"target": ["#a"]}}, "bbox": box(500)},
                {"key": "c2", "evidence": {}, "bbox": box(5, 100)},
                {"key": "c3", "evidence": {}, "bbox": box(0, 900)},
                {"key": "c4", "sc": "2.4.7", "focus_index": 3, "evidence": {}},
                {"key": "c5", "viewport": "mobile", "evidence": {"rule": {"target": ["#m"]}}},
                {"key": "c6", "viewport": "mobile", "evidence": {"rule": {"target": ["#n"]}}},
            ],
        )
        body = c.get(f"/runs/{cur_id}/delta").json()
        assert body["previous_run_id"] == prev_id
        assert {f["key"] for f in body["still_present"]} == {"c1", "c2", "c4", "c5"}
        assert {f["key"] for f in body["new"]} == {"c3", "c6"}
        assert {f["key"] for f in body["fixed"]} == {"p3", "p5", "p7"}
        assert {f["key"] for f in body["fixes_verified"]} == {"p3", "p5", "p7"}
        none = c.get(f"/runs/{prev_id}/delta").json()
        assert none["previous_run_id"] is None and none["fixed"] == [] and none["new"] == []
        assert c.get("/runs/zz/delta").status_code == 404
        assert c.get(f"/runs/{'0' * 32}/delta").status_code == 404


def test_delta_does_not_verify_fixes_that_are_still_present(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        row = {"key": "p1", "evidence": {"rule": {"target": ["#a"]}}, "status": "fixed"}
        add_run(
            c, tmp_path, "a" * 32, "https://x.com", [row, {"key": "q", "evidence": {}}], age_days=1
        )
        add_run(
            c,
            tmp_path,
            "b" * 32,
            "https://x.com",
            [{"key": "c1", "evidence": {"rule": {"target": ["#a"]}}}],
        )
        body = c.get(f"/runs/{'b' * 32}/delta").json()
        assert body["fixes_verified"] == [] and len(body["fixed"]) == 1
        assert [f["key"] for f in body["still_present"]] == ["c1"]


def test_sites_rows_counts_delta_and_criteria(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            "a" * 32,
            "https://x.com/p",
            [{"key": "p1"}, {"key": "p2"}, {"key": "p3"}],
            age_days=2,
        )
        add_run(
            c,
            tmp_path,
            "b" * 32,
            "https://x.com/p/",
            [{"key": "c1"}, nr("n1", "r"), nr("n2", "r", status="confirmed")],
            age_days=1,
            verdicts={
                "desktop": {"1.4.3": {"hybrid": "automated"}, "2.5.8": {"hybrid": "needs-review"}},
                "mobile": {"1.4.3": {"hybrid": "automated"}, "1.4.11": {"hybrid": "automated"}},
            },
        )
        add_run(
            c,
            tmp_path,
            "c" * 32,
            "/f",
            [{"key": "z"}],
            kind="folder",
            age_days=0.5,
            condition="rule_only",
            verdicts={"desktop": {"1.4.3": {"rule": "automated", "hybrid": "none"}}},
        )
        add_run(c, tmp_path, "d" * 32, "https://new.com", [], status="running")
        rows = c.get("/sites").json()
        assert [r["site"] for r in rows] == ["new.com", "/f", "x.com/p"]
        x = rows[2]
        assert x["latest_run"]["id"] == "b" * 32 and x["previous_run_id"] == "a" * 32
        assert x["failures"] == 1 and x["failures_delta"] == -2
        assert x["to_review"] == 1 and x["criteria_decided"] == 2
        assert x["latest_run"]["viewports"] == ["desktop", "mobile"]
        assert x["latest_run"]["condition"] == "hybrid" and x["latest_run"]["error"] is None
        f = rows[1]
        assert f["criteria_decided"] == 1 and f["previous_run_id"] is None
        assert f["failures_delta"] is None
        n = rows[0]
        assert n["latest_run"]["status"] == "running" and n["failures"] == 0


def test_week_summary(tmp_path: Path) -> None:
    from app.report_api import FindingOut  # noqa: F401

    week_start = (NOW - timedelta(days=NOW.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    inside = (NOW - week_start).total_seconds() / 86400
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            "a" * 32,
            "https://x.com",
            [
                {"key": "p1", "evidence": {"rule": {"target": ["#a"]}}, "status": "fixed"},
                {"key": "p2", "evidence": {"rule": {"target": ["#b"]}}, "status": "fixed"},
            ],
            age_days=inside + 3,
            verdicts={"desktop": {"1.4.3": {"hybrid": "automated"}}},
        )
        add_run(
            c,
            tmp_path,
            "b" * 32,
            "https://x.com",
            [
                {
                    "key": "c1",
                    "evidence": {"rule": {"target": ["#b"]}},
                    "status": "fixed",
                    "decided_at": NOW,
                }
            ],
            age_days=0,
            verdicts={
                "desktop": {
                    "1.4.3": {"hybrid": "automated"},
                    "2.5.8": {"hybrid": "automated"},
                    "1.4.11": {"hybrid": "automated"},
                }
            },
        )
        add_run(c, tmp_path, "c" * 32, "https://y.com", [], age_days=inside + 10)
        add_run(c, tmp_path, "d" * 32, "https://z.com", [], status="running")
        body = c.get("/summary/week").json()
        assert body["audits_this_week"] == 2 and body["audits_last_week"] == 1
        assert body["fixes_verified_this_week"] == 1
        assert body["decisions_this_week"] == 1
        assert body["median_criteria_decided"] == 1.5
        assert [r["run_id"] for r in body["running"]] == ["d" * 32]
        assert body["running"][0]["stage_status"] == {"capture": "running"}
        assert body["fixes_to_verify"] == {"findings": 1, "sites": 1}


def test_week_summary_empty(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        body = c.get("/summary/week").json()
        assert body["audits_this_week"] == 0 and body["median_criteria_decided"] == 0
        assert body["running"] == [] and body["fixes_to_verify"] == {"findings": 0, "sites": 0}
