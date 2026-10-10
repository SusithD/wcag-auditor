import csv
import shutil
import sys
from collections import Counter
from pathlib import Path
from typing import Any, cast

import pytest
from app import study as st
from app.config import Settings
from app.main import create_app
from app.models import Run, StudyRun
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[3]
STUDY = ROOT / "study"
TOKEN = "t0ken"
sys.path.insert(0, str(ROOT / "scripts"))


def make_client(tmp_path: Path, **over: Any) -> TestClient:
    settings = Settings(
        data_dir=tmp_path / "data",
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        folder_roots=(ROOT.resolve(),),
        pdf=False,
        study_dir=over.pop("study_dir", STUDY),
        study_admin_token=over.pop("study_admin_token", TOKEN),
        **over,
    )
    return TestClient(create_app(settings))


def seed_runs(c: TestClient) -> None:
    study = st.Study(STUDY)
    with cast(Any, c.app).state.sessions() as session:
        for task in study.tasks.values():
            for condition in st.CONDITIONS:
                run_id = f"{task.id}-{condition}".encode().hex().ljust(32, "0")[:32]
                session.add(
                    Run(
                        id=run_id, source_kind="folder", source="x", viewports=["desktop"],
                        condition=condition, status="done", stage_status={},
                    )
                )  # fmt: skip
                session.add(StudyRun(task_id=task.id, condition=condition, run_id=run_id))
        session.commit()


def test_sus_scoring_follows_brooke() -> None:
    assert st.sus_score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]) == 100.0
    assert st.sus_score([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]) == 0.0
    assert st.sus_score([3] * 10) == 50.0
    assert st.sus_score([4, 2, 4, 2, 4, 2, 4, 2, 4, 2]) == 75.0
    for bad in ([3] * 9, [3] * 11, [6] + [3] * 9, [0] + [3] * 9):
        with pytest.raises(ValueError, match="ten responses"):
            st.sus_score(bad)


def test_the_committed_assignments_are_counterbalanced_and_reproducible(tmp_path: Path) -> None:
    study = st.Study(STUDY)
    rows = list(study.assignments.values())
    assert len(rows) == 16 and all(r.synthetic and r.code.startswith("SYN") for r in rows)
    assert Counter(r.order for r in rows) == {"AB": 8, "BA": 8}
    assert Counter((r.order, r.sets[0]) for r in rows) == {
        ("AB", "S1"): 4, ("AB", "S2"): 4, ("BA", "S1"): 4, ("BA", "S2"): 4,
    }  # fmt: skip
    for r in rows:
        assert len(set(r.task_order)) == 8 and set(r.task_order) == set(study.tasks)
        first, second = r.task_order[:4], r.task_order[4:]
        assert {study.tasks[t].set for t in first} == {r.sets[0]}
        assert {study.tasks[t].set for t in second} == {r.sets[1]}
        assert r.conditions == (
            ("rule_only", "hybrid") if r.order == "AB" else ("hybrid", "rule_only")
        )
    import make_assignments  # type: ignore[import-not-found]

    out = make_assignments.main(tmp_path / "again.csv")
    assert out.read_bytes() == (STUDY / "assignments.csv").read_bytes()


def test_task_sets_are_matched_and_every_task_has_a_complete_rubric() -> None:
    study = st.Study(STUDY)
    assert set(study.sets) == {"S1", "S2"} and len(study.tasks) == 8
    for ids in study.sets.values():
        reported = [t for t in ids if "rule_only" in study.tasks[t].rubric["reported_by"]]
        assert len(ids) == 4 and len(reported) == 1
    assert len({t.sc for t in study.tasks.values()}) == 8
    for t in study.tasks.values():
        assert {
            "issue",
            "expected_fix",
            "success_criteria",
            "partial_credit",
            "reported_by",
        } <= set(t.rubric)
        assert t.rubric["issue"] and t.rubric["expected_fix"] and t.rubric["success_criteria"]
        assert (ROOT / t.folder / "meta.json").is_file()


def test_the_step_sequence_matches_the_session_script() -> None:
    kinds = [s.kind for s in st.steps()]
    assert kinds == ["consent", "demographics"] + ["task"] * 4 + ["sus", "break"] + ["task"] * 4 + [
        "sus",
        "debrief",
        "done",
    ]


def full_session(c: TestClient, code: str) -> None:
    mats = c.get("/study/materials").json()
    assert len(mats["consent_statements"]) == 6 and len(mats["sus_items"]) == 10
    state = c.post("/study/sessions", json={"code": code}).json()
    assert state["next"]["kind"] == "consent"
    state = c.post(
        f"/study/sessions/{code}/consent",
        json={"statements": [True] * 6, "optional": {"quotes": True}},
    ).json()
    answers = {k: v[0] for k, v in mats["demographics"].items()}
    state = c.post(f"/study/sessions/{code}/demographics", json={"answers": answers}).json()
    for block in (1, 2):
        for _ in range(4):
            step = state["next"]
            assert step["kind"] == "task"
            index = step["task_index"]
            view = c.post(f"/study/sessions/{code}/tasks/{index}/open").json()
            assert view["condition"] == state["block_condition"] and view["run_id"]
            state = c.post(
                f"/study/sessions/{code}/tasks/{index}/submit", json={"fix_text": f"fix {index}"}
            ).json()
        assert state["next"]["kind"] == "sus" and state["next"]["block"] == block
        state = c.post(
            f"/study/sessions/{code}/sus/{block}", json={"scores": [4, 2, 4, 2, 4, 2, 4, 2, 4, 2]}
        ).json()
        if block == 1:
            assert state["next"]["kind"] == "break"
            state = c.post(f"/study/sessions/{code}/break").json()
    assert state["next"]["kind"] == "debrief"
    state = c.post(f"/study/sessions/{code}/debrief", json={"answers": ["a", "b", "c"]}).json()
    assert state["next"]["kind"] == "done"


def test_a_full_session_writes_timing_sus_and_exports(tmp_path: Path) -> None:
    with make_client(tmp_path) as c:
        seed_runs(c)
        full_session(c, "SYN01")
        full_session(c, "SYN03")
        h = {"X-Study-Token": TOKEN}
        tasks = c.get("/study/admin/tasks", headers=h).json()
        assert len(tasks) == 16 and all(
            t["seconds"] is not None and t["seconds"] >= 0 for t in tasks
        )
        assert {
            t["condition"] for t in tasks if t["participant_code"] == "SYN01" and t["block"] == 1
        } == {"rule_only"}
        assert {
            t["condition"] for t in tasks if t["participant_code"] == "SYN03" and t["block"] == 1
        } == {"hybrid"}
        assert all(t["rubric"]["expected_fix"] and t["rubric"]["success_criteria"] for t in tasks)
        rated = c.patch(
            f"/study/admin/tasks/{tasks[0]['id']}", json={"success": True, "notes": "ok"}, headers=h
        )
        assert rated.json()["success"] is True

        rows = list(
            csv.DictReader(c.get("/study/admin/export/tasks.csv", headers=h).text.splitlines())
        )
        assert (
            len(rows) == 16
            and list(rows[0]) == __import__("app.study_api", fromlist=["x"]).TASK_FIELDS
        )
        assert rows[0]["rubric_issue"] and rows[0]["synthetic"] == "1" and rows[0]["success"] == "1"
        sus = list(
            csv.DictReader(c.get("/study/admin/export/sus.csv", headers=h).text.splitlines())
        )
        assert len(sus) == 4 and {r["sus_score"] for r in sus} == {"75.0"}
        assert {(r["participant_code"], r["block"], r["condition"]) for r in sus} >= {
            ("SYN01", "1", "rule_only"),
            ("SYN03", "1", "hybrid"),
        }
        sessions = list(
            csv.DictReader(c.get("/study/admin/export/sessions.csv", headers=h).text.splitlines())
        )
        assert (
            len(sessions) == 2
            and sessions[0]["optional_quotes"] == "1"
            and sessions[0]["completed_at"]
        )


def test_steps_are_enforced_and_inputs_validated(tmp_path: Path) -> None:
    with make_client(tmp_path) as c:
        assert c.post("/study/sessions", json={"code": "SYN01"}).status_code == 409
        seed_runs(c)
        assert c.post("/study/sessions", json={"code": "nope"}).status_code == 404
        assert c.post("/study/sessions", json={"code": "bad code!"}).status_code == 422
        c.post("/study/sessions", json={"code": "SYN02"})
        assert c.post("/study/sessions/SYN02/tasks/1/open").status_code == 409
        valid = {k: v[0] for k, v in c.get("/study/materials").json()["demographics"].items()}
        assert (
            c.post("/study/sessions/SYN02/demographics", json={"answers": valid}).status_code == 409
        )
        short = [True] * 5 + [False]
        assert (
            c.post("/study/sessions/SYN02/consent", json={"statements": short}).status_code == 422
        )
        assert (
            c.post(
                "/study/sessions/SYN02/consent",
                json={"statements": [True] * 6, "optional": {"x": True}},
            ).status_code
            == 422
        )
        c.post("/study/sessions/SYN02/consent", json={"statements": [True] * 6})
        assert (
            c.post(
                "/study/sessions/SYN02/demographics", json={"answers": {"age_band": "999"}}
            ).status_code
            == 422
        )
        mats = c.get("/study/materials").json()
        c.post(
            "/study/sessions/SYN02/demographics",
            json={"answers": {k: v[0] for k, v in mats["demographics"].items()}},
        )
        assert c.post("/study/sessions/SYN02/tasks/2/open").status_code == 409
        assert (
            c.post("/study/sessions/SYN02/tasks/1/submit", json={"fix_text": "x"}).status_code
            == 409
        )
        c.post("/study/sessions/SYN02/tasks/1/open")
        first = c.get("/study/sessions/SYN02").json()
        assert first["tasks"][0]["status"] == "open"
        assert (
            c.post("/study/sessions/SYN02/tasks/1/submit", json={"fix_text": "   "}).status_code
            == 422
        )
        assert c.post("/study/sessions/SYN02/sus/1", json={"scores": [3] * 10}).status_code == 409


def test_reopening_a_task_keeps_the_first_open_time(tmp_path: Path) -> None:
    with make_client(tmp_path) as c:
        seed_runs(c)
        c.post("/study/sessions", json={"code": "SYN04"})
        c.post("/study/sessions/SYN04/consent", json={"statements": [True] * 6})
        mats = c.get("/study/materials").json()
        c.post(
            "/study/sessions/SYN04/demographics",
            json={"answers": {k: v[0] for k, v in mats["demographics"].items()}},
        )
        c.post("/study/sessions/SYN04/tasks/1/open")
        c.post("/study/sessions/SYN04/tasks/1/open")
        with cast(Any, c.app).state.sessions() as session:
            from app.models import StudyTask
            from sqlalchemy import select

            t = session.scalars(select(StudyTask).where(StudyTask.task_index == 1)).one()
            first = t.opened_at
        c.post("/study/sessions/SYN04/tasks/1/open")
        with cast(Any, c.app).state.sessions() as session:
            assert (
                session.scalars(select(StudyTask).where(StudyTask.task_index == 1)).one().opened_at
                == first
            )


def test_admin_endpoints_need_the_token_and_are_off_without_one(tmp_path: Path) -> None:
    with make_client(tmp_path) as c:
        assert c.get("/study/admin/tasks").status_code == 403
        assert c.get("/study/admin/tasks", headers={"X-Study-Token": "wrong"}).status_code == 403
        assert c.post("/study/prepare").status_code == 403
        assert c.get("/study/admin/export/tasks.csv").status_code == 403
        assert (
            c.get("/study/admin/export/bogus.csv", headers={"X-Study-Token": TOKEN}).status_code
            == 422
        )
    with make_client(tmp_path / "off", study_admin_token=None) as c:
        r = c.get("/study/admin/tasks", headers={"X-Study-Token": TOKEN})
        assert r.status_code == 403 and "disabled" in r.text


def test_real_participant_codes_are_refused_until_ethics_approval_is_recorded(
    tmp_path: Path,
) -> None:
    study = tmp_path / "study"
    shutil.copytree(STUDY, study)
    rows = list(csv.DictReader((study / "assignments.csv").open()))
    rows.append({**rows[0], "participant_code": "P01", "synthetic": "0"})
    with (study / "assignments.csv").open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    with make_client(tmp_path / "a", study_dir=study) as c:
        seed_runs(c)
        assert c.get("/study/config").json()["ethics_approved"] is False
        r = c.post("/study/sessions", json={"code": "P01"})
        assert r.status_code == 403 and "ethics approval" in r.text
        assert c.post("/study/sessions", json={"code": "SYN01"}).status_code == 200
    with make_client(tmp_path / "b", study_dir=study, study_ethics_approved=True) as c:
        seed_runs(c)
        assert c.post("/study/sessions", json={"code": "P01"}).json()["synthetic"] is False


def test_ethics_approval_is_off_by_default_and_nothing_real_is_committed() -> None:
    assert Settings.from_env().study_ethics_approved is False
    codes = [r["participant_code"] for r in csv.DictReader((STUDY / "assignments.csv").open())]
    assert all(c.startswith("SYN") for c in codes)


def test_prepare_queues_one_run_per_task_and_condition_and_is_idempotent(tmp_path: Path) -> None:
    study = tmp_path / "study"
    study.mkdir()
    import yaml

    data = yaml.safe_load((STUDY / "tasks.yaml").read_text())
    data["tasks"] = data["tasks"][:2]
    data["sets"] = {"S1": ["T1", "T2"], "S2": []}
    (study / "tasks.yaml").write_text(yaml.safe_dump(data))
    shutil.copy(STUDY / "assignments.csv", study / "assignments.csv")
    with make_client(tmp_path / "x", study_dir=study) as c:
        first = c.post("/study/prepare", headers={"X-Study-Token": TOKEN}).json()
        assert first["queued"] == 4 and first["total"] == 4
        again = c.post("/study/prepare", headers={"X-Study-Token": TOKEN}).json()
        assert again["queued"] == 0
        import time

        deadline = time.time() + 180
        while time.time() < deadline and c.get("/study/config").json()["prepared"] < 4:
            time.sleep(1)
        assert c.get("/study/config").json()["prepared"] == 4


def test_the_synthetic_dry_run_exercises_every_export_and_stays_labelled_fabricated(
    tmp_path: Path,
) -> None:
    import study_dryrun  # type: ignore[import-not-found]

    summary = study_dryrun.dry_run(tmp_path)
    assert summary["participants"] == 16
    assert summary["rule_only"]["tasks"] == summary["hybrid"]["tasks"] == 64
    assert 0 <= summary["rule_only"]["success_rate"] <= 1
    assert "fabricated" in (tmp_path / "dry_run.md").read_text()
    assert len(list(csv.DictReader((tmp_path / "tasks.csv").open()))) == 128
    assert len(list(csv.DictReader((tmp_path / "sus.csv").open()))) == 32
    assert study_dryrun.dry_run(tmp_path / "again") == summary


def test_real_participants_exist_only_if_ethics_approval_is_recorded_in_the_notes() -> None:
    notes = (ROOT / "NOTES.md").read_text()
    approved = any(line.startswith("ETHICS APPROVAL RECORDED:") for line in notes.splitlines())
    real = [
        r["participant_code"]
        for r in csv.DictReader((STUDY / "assignments.csv").open())
        if r["synthetic"] == "0"
    ]
    assert approved or not real
