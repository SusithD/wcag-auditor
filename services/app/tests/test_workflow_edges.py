from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from app.models import Run
from auditor import protocol
from test_runs_api import client
from test_workflow_api import add_run, box, nr

PREV, CUR = "a" * 32, "b" * 32


def iou_offset(iou_min: float) -> float:
    return 100 * (1 - iou_min) / (1 + iou_min)


def delta_keys(body: dict[str, Any]) -> dict[str, set[str]]:
    return {
        name: {f["key"] for f in body[name]}
        for name in ("fixed", "new", "still_present", "fixes_verified")
    }


def pin_created_at(c: Any, run_id: str, when: datetime) -> None:
    with cast(Any, c.app).state.sessions() as session:
        session.get(Run, run_id).created_at = when
        session.commit()


def test_undo_clears_reason_note_and_decision_stamps(tmp_path: Path) -> None:
    with client(tmp_path, decided_by_name="Sam") as c:
        add_run(c, tmp_path, PREV, "https://x.com", [{"key": "p1"}])
        report = tmp_path / PREV / "desktop" / "desktop" / "report.json"
        report.parent.mkdir(parents=True)
        report.write_text("{}", encoding="utf-8")
        with cast(Any, c.app).state.sessions() as session:
            from app.models import FindingRow

            finding_id = session.query(FindingRow).one().id
        url = f"/findings/{finding_id}"
        decided = c.patch(url, json={"status": "dismissed", "reason": "Decorative", "note": "n"})
        body = decided.json()["decision"]
        assert body["reason"] == "Decorative" and body["note"] == "n"
        assert body["decided_at"] and body["decided_by"] == "Sam"
        undone = c.patch(url, json={"status": "open"}).json()
        assert undone["status"] == "open"
        assert undone["decision"] == {
            "status": "open",
            "reason": None,
            "note": None,
            "decided_at": None,
            "decided_by": None,
        }
        with cast(Any, c.app).state.sessions() as session:
            row = session.get(FindingRow, finding_id)
            assert row is not None
            assert row.decision_reason is None and row.decision_note is None
            assert row.decided_at is None and row.decided_by is None


def test_delta_iou_boundary_uses_the_protocol_threshold(tmp_path: Path) -> None:
    iou_min = protocol.load().thresholds.match.iou
    offset = iou_offset(iou_min)
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            PREV,
            "https://x.com",
            [
                {"key": "below", "evidence": {}, "bbox": box(0, 0)},
                {"key": "above", "evidence": {}, "bbox": box(0, 100)},
            ],
            age_days=1,
        )
        add_run(
            c,
            tmp_path,
            CUR,
            "https://x.com",
            [
                {"key": "c-below", "evidence": {}, "bbox": box(offset + 0.5, 0)},
                {"key": "c-above", "evidence": {}, "bbox": box(offset - 0.5, 100)},
            ],
        )
        keys = delta_keys(c.get(f"/runs/{CUR}/delta").json())
        assert keys["new"] == {"c-below"} and keys["fixed"] == {"below"}
        assert keys["still_present"] == {"c-above"}


def test_delta_iou_exactly_at_threshold_counts_as_still_present(tmp_path: Path) -> None:
    iou_min = protocol.load().thresholds.match.iou
    from auditor.geometry import iou
    from auditor.schema import BBox

    offset = iou_offset(iou_min)
    a, b = BBox(**box(0)), BBox(**box(offset))
    assert abs(iou(a, b) - iou_min) < 1e-9
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            PREV,
            "https://x.com",
            [{"key": "p", "evidence": {}, "bbox": box(0)}],
            age_days=1,
        )
        add_run(
            c,
            tmp_path,
            CUR,
            "https://x.com",
            [{"key": "c", "evidence": {}, "bbox": box(offset - 1e-6)}],
        )
        keys = delta_keys(c.get(f"/runs/{CUR}/delta").json())
        assert keys["still_present"] == {"c"} and keys["new"] == set()


def test_delta_matching_is_one_to_one(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            PREV,
            "https://x.com",
            [{"key": "p", "evidence": {}, "bbox": box(0)}],
            age_days=1,
        )
        add_run(
            c,
            tmp_path,
            CUR,
            "https://x.com",
            [
                {"key": "c1", "evidence": {}, "bbox": box(0)},
                {"key": "c2", "evidence": {}, "bbox": box(1)},
            ],
        )
        keys = delta_keys(c.get(f"/runs/{CUR}/delta").json())
        assert len(keys["still_present"]) == 1 and len(keys["new"]) == 1
        assert keys["fixed"] == set()
        assert keys["still_present"] | keys["new"] == {"c1", "c2"}


def test_delta_other_source_with_same_viewport_is_not_a_previous_run(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, PREV, "https://other.com", [{"key": "p", "evidence": {}}], age_days=1)
        add_run(c, tmp_path, CUR, "https://x.com", [{"key": "c", "evidence": {}}])
        body = c.get(f"/runs/{CUR}/delta").json()
        assert body["previous_run_id"] is None
        assert body["new"] == [] and body["fixed"] == [] and body["still_present"] == []


def test_delta_ignores_failed_and_running_previous_runs(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            "c" * 32,
            "https://x.com",
            [{"key": "q", "evidence": {}}],
            status="failed",
            age_days=3,
        )
        add_run(c, tmp_path, "d" * 32, "https://x.com", [], status="running", age_days=2)
        add_run(c, tmp_path, CUR, "https://x.com", [{"key": "c", "evidence": {}}])
        assert c.get(f"/runs/{CUR}/delta").json()["previous_run_id"] is None
        add_run(c, tmp_path, PREV, "https://x.com", [{"key": "p", "evidence": {}}], age_days=4)
        pin_created_at(c, "c" * 32, datetime.now(UTC) - timedelta(days=1))
        pin_created_at(c, "d" * 32, datetime.now(UTC) - timedelta(hours=1))
        assert c.get(f"/runs/{CUR}/delta").json()["previous_run_id"] == PREV


def test_delta_for_a_run_that_is_not_finished_has_no_previous(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, PREV, "https://x.com", [{"key": "p", "evidence": {}}], age_days=1)
        add_run(c, tmp_path, CUR, "https://x.com", [], status="failed")
        body = c.get(f"/runs/{CUR}/delta").json()
        assert body["previous_run_id"] is None and body["fixed"] == []


def test_delta_focus_findings_match_on_focus_index_not_bbox(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            PREV,
            "https://x.com",
            [
                {"key": "p1", "sc": "2.4.7", "focus_index": 1, "evidence": {}, "bbox": box(0)},
                {"key": "p2", "sc": "2.4.7", "focus_index": 2, "evidence": {}, "bbox": box(0, 300)},
            ],
            age_days=1,
        )
        add_run(
            c,
            tmp_path,
            CUR,
            "https://x.com",
            [
                {"key": "c1", "sc": "2.4.7", "focus_index": 2, "evidence": {}, "bbox": box(0)},
                {"key": "c2", "sc": "2.4.7", "focus_index": 1, "evidence": {}, "bbox": box(0, 900)},
            ],
        )
        keys = delta_keys(c.get(f"/runs/{CUR}/delta").json())
        assert keys["still_present"] == {"c1", "c2"}
        assert keys["new"] == set() and keys["fixed"] == set()


def test_delta_fixes_verified_counts_only_fixed_findings_that_are_gone(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            PREV,
            "https://x.com",
            [
                {"key": "gone-fixed", "evidence": {}, "bbox": box(0), "status": "fixed"},
                {"key": "gone-open", "evidence": {}, "bbox": box(0, 200)},
                {"key": "kept-fixed", "evidence": {}, "bbox": box(0, 400), "status": "fixed"},
            ],
            age_days=1,
        )
        add_run(
            c, tmp_path, CUR, "https://x.com", [{"key": "c", "evidence": {}, "bbox": box(0, 400)}]
        )
        keys = delta_keys(c.get(f"/runs/{CUR}/delta").json())
        assert keys["fixed"] == {"gone-fixed", "gone-open"}
        assert keys["fixes_verified"] == {"gone-fixed"}


def week_start() -> datetime:
    now = datetime.now(UTC)
    day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday())


def week_counts(c: Any) -> dict[str, Any]:
    return cast(dict[str, Any], c.get("/summary/week").json())


def test_week_boundary_is_monday_midnight_utc(tmp_path: Path) -> None:
    start = week_start()
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://a.com", [])
        add_run(c, tmp_path, "b" * 32, "https://b.com", [])
        add_run(c, tmp_path, "c" * 32, "https://c.com", [])
        add_run(c, tmp_path, "d" * 32, "https://d.com", [])
        pin_created_at(c, "a" * 32, start)
        pin_created_at(c, "b" * 32, start - timedelta(microseconds=1))
        pin_created_at(c, "c" * 32, start - timedelta(days=7))
        pin_created_at(c, "d" * 32, start - timedelta(days=7, microseconds=1))
        if week_start() != start:
            return
        body = week_counts(c)
        assert body["audits_this_week"] == 1
        assert body["audits_last_week"] == 2


def test_week_counts_failed_runs_as_audits_run(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://a.com", [])
        add_run(c, tmp_path, "b" * 32, "https://b.com", [], status="failed")
        pin_created_at(c, "a" * 32, week_start() + timedelta(seconds=1))
        pin_created_at(c, "b" * 32, week_start() + timedelta(seconds=2))
        if week_start() > datetime.now(UTC):
            return
        assert week_counts(c)["audits_this_week"] == 2


def test_week_fixes_to_verify_drops_sites_audited_again(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(
            c,
            tmp_path,
            "a" * 32,
            "https://redone.com",
            [{"key": "p", "evidence": {}, "status": "fixed"}],
            age_days=2,
        )
        add_run(
            c, tmp_path, "b" * 32, "https://redone.com", [{"key": "c", "evidence": {}}], age_days=1
        )
        add_run(
            c,
            tmp_path,
            "c" * 32,
            "https://waiting.com",
            [
                {"key": "w1", "evidence": {}, "status": "fixed"},
                {"key": "w2", "evidence": {}, "status": "fixed"},
            ],
            age_days=1,
        )
        assert week_counts(c)["fixes_to_verify"] == {"findings": 2, "sites": 1}


def test_week_median_criteria_decided_for_odd_and_even_site_counts(tmp_path: Path) -> None:
    def verdicts(n: int) -> dict[str, dict[str, dict[str, str]]]:
        scs = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.5.8", "2.5.7"]
        return {"desktop": {sc: {"hybrid": "automated"} for sc in scs[:n]}}

    with client(tmp_path) as c:
        for i, n in enumerate((1, 2, 6)):
            add_run(c, tmp_path, f"{i:x}" * 32, f"https://s{i}.com", [], verdicts=verdicts(n))
        assert week_counts(c)["median_criteria_decided"] == 2.0
        add_run(c, tmp_path, "9" * 32, "https://s9.com", [], verdicts=verdicts(4))
        assert week_counts(c)["median_criteria_decided"] == 3.0


def test_sites_single_run_has_no_previous_and_no_delta(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://solo.com", [{"key": "p1"}, {"key": "p2"}])
        row = c.get("/sites").json()[0]
        assert row["previous_run_id"] is None and row["failures_delta"] is None
        assert row["failures"] == 2


def test_sites_show_the_finished_run_behind_a_newer_unfinished_one(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://x.com", [{"key": "p1"}], age_days=3)
        add_run(c, tmp_path, "b" * 32, "https://x.com", [{"key": "p1"}, {"key": "p2"}], age_days=2)
        add_run(c, tmp_path, "c" * 32, "https://x.com", [], status="cancelled", age_days=1)
        add_run(c, tmp_path, "d" * 32, "https://y.com", [], status="failed", age_days=1)
        rows = {r["site"]: r for r in c.get("/sites").json()}
        x = rows["x.com"]
        assert x["latest_run"]["id"] == "b" * 32 and x["latest_run"]["status"] == "done"
        assert x["newer_run"]["id"] == "c" * 32 and x["newer_run"]["status"] == "cancelled"
        assert x["failures"] == 2 and x["failures_delta"] == 1
        assert x["previous_run_id"] == "a" * 32
        y = rows["y.com"]
        assert y["latest_run"]["status"] == "failed" and y["newer_run"] is None
        assert y["failures"] == 0


def test_sites_newer_run_is_null_when_latest_is_finished(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://x.com", [{"key": "p1"}])
        assert c.get("/sites").json()[0]["newer_run"] is None


def test_review_state_reason_and_latest_finished_run_only(tmp_path: Path) -> None:
    with client(tmp_path) as c:
        add_run(c, tmp_path, "a" * 32, "https://x.com", [nr("old", "r1")], age_days=3)
        add_run(
            c,
            tmp_path,
            "b" * 32,
            "https://x.com",
            [
                nr("w1", "low-confidence"),
                nr("w2", "no-dom", status="unsure"),
                nr("d1", "low-confidence", status="confirmed"),
                nr("d2", "no-dom", status="dismissed"),
            ],
            age_days=2,
        )
        add_run(
            c, tmp_path, "c" * 32, "https://x.com", [nr("run", "r1")], status="running", age_days=1
        )
        add_run(c, tmp_path, "d" * 32, "https://x.com", [nr("bad", "r1")], status="failed")
        waiting = c.get("/review").json()
        assert {i["finding"]["key"] for i in waiting["items"]} == {"w1", "w2"}
        assert {i["run_id"] for i in waiting["items"]} == {"b" * 32}
        decided = c.get("/review", params={"state": "decided"}).json()
        assert {i["finding"]["key"] for i in decided["items"]} == {"d1", "d2"}
        both = c.get("/review", params={"state": "decided", "reason": "no-dom"}).json()
        assert [i["finding"]["key"] for i in both["items"]] == ["d2"] and both["total"] == 1
        assert {(r["reason"], r["count"]) for r in both["counts_by_reason"]} == {
            ("low-confidence", 1),
            ("no-dom", 1),
        }
        none = c.get("/review", params={"reason": "missing", "state": "all"}).json()
        assert none["items"] == [] and none["total"] == 0
