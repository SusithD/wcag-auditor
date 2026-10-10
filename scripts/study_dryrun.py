from __future__ import annotations

import csv
import random
import statistics
import sys
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "app"))

TOKEN = "dry-run-token"
SEED = 20261011
PASS_IF_REPORTED = 0.8
PASS_IF_NOT_REPORTED = 0.35


def clamp(value: float) -> int:
    return min(5, max(1, round(value)))


def target(hybrid: bool, item_index: int) -> float:
    """Positive items (1,3,5,7,9) score high for the better report, negative items low."""
    good = 4.3 if hybrid else 3.3
    return good if item_index % 2 == 0 else 6 - good


def dry_run(out: Path) -> dict[str, Any]:
    """Run every synthetic participant through the study API with simulated behaviour and write
    the three exports plus a summary. Everything is fabricated: never mix it with real data."""
    from app import study as st
    from app.config import Settings
    from app.main import create_app
    from app.models import Run, StudyRun
    from fastapi.testclient import TestClient

    rng = random.Random(SEED)
    out.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="study_dryrun_"))
    study = st.Study(ROOT / "study")
    settings = Settings(
        data_dir=work / "data",
        db_url=f"sqlite:///{work / 'app.db'}",
        folder_roots=(ROOT.resolve(),),
        pdf=False,
        study_admin_token=TOKEN,
    )
    headers = {"X-Study-Token": TOKEN}
    with TestClient(create_app(settings)) as c:
        with c.app.state.sessions() as session:  # type: ignore[attr-defined]
            for task in study.tasks.values():
                for condition in st.CONDITIONS:
                    run_id = f"{task.id}{condition}".encode().hex().ljust(32, "0")[:32]
                    session.add(
                        Run(
                            id=run_id,
                            source_kind="folder",
                            source="dry-run",
                            viewports=["desktop"],
                            condition=condition,
                            status="done",
                            stage_status={},
                        )
                    )
                    session.add(StudyRun(task_id=task.id, condition=condition, run_id=run_id))
            session.commit()
        demo = {k: v[0] for k, v in c.get("/study/materials").json()["demographics"].items()}
        for code, assignment in study.assignments.items():
            c.post("/study/sessions", json={"code": code})
            c.post(f"/study/sessions/{code}/consent", json={"statements": [True] * 6})
            c.post(f"/study/sessions/{code}/demographics", json={"answers": demo})
            for block in (1, 2):
                for _ in range(st.BLOCK_SIZE):
                    step = c.get(f"/study/sessions/{code}").json()["next"]
                    index = step["task_index"]
                    c.post(f"/study/sessions/{code}/tasks/{index}/open")
                    c.post(
                        f"/study/sessions/{code}/tasks/{index}/submit",
                        json={"fix_text": f"simulated fix for task {index}"},
                    )
                hybrid = assignment.conditions[block - 1] == "hybrid"
                scores = [clamp(rng.gauss(target(hybrid, i), 0.6)) for i in range(10)]
                c.post(f"/study/sessions/{code}/sus/{block}", json={"scores": scores})
                if block == 1:
                    c.post(f"/study/sessions/{code}/break")
            c.post(f"/study/sessions/{code}/debrief", json={"answers": ["simulated"] * 3})
        for t in c.get("/study/admin/tasks", headers=headers).json():
            chance = PASS_IF_REPORTED if t["reported_by_condition"] else PASS_IF_NOT_REPORTED
            c.patch(
                f"/study/admin/tasks/{t['id']}",
                json={"success": rng.random() < chance, "notes": "simulated rating"},
                headers=headers,
            )
        for kind in ("tasks", "sus", "sessions"):
            (out / f"{kind}.csv").write_text(
                c.get(f"/study/admin/export/{kind}.csv", headers=headers).text
            )
    return summarise(out)


def summarise(out: Path) -> dict[str, Any]:
    tasks = list(csv.DictReader((out / "tasks.csv").open()))
    sus = list(csv.DictReader((out / "sus.csv").open()))
    summary: dict[str, Any] = {"participants": len({r["participant_code"] for r in tasks})}
    for condition in ("rule_only", "hybrid"):
        rows = [r for r in tasks if r["condition"] == condition]
        rated = [r for r in rows if r["success"] != ""]
        summary[condition] = {
            "tasks": len(rows),
            "success_rate": round(sum(int(r["success"]) for r in rated) / len(rated), 3),
            "mean_sus": round(
                statistics.mean(float(r["sus_score"]) for r in sus if r["condition"] == condition),
                1,
            ),
        }
    text = (
        "# Synthetic dry run (fabricated data)\n\n"
        "Simulated participants exercise the study API, exports and the analysis arithmetic. "
        "Nothing here is evidence about the tool.\n\n"
        f"- participants: {summary['participants']}\n"
    )
    for condition in ("rule_only", "hybrid"):
        s = summary[condition]
        text += (
            f"- {condition}: {s['tasks']} tasks, success {s['success_rate']}, "
            f"mean SUS {s['mean_sus']}\n"
        )
    (out / "dry_run.md").write_text(text)
    return summary


if __name__ == "__main__":
    print(dry_run(Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "study_dry_run"))
