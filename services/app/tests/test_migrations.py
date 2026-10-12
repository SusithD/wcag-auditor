from pathlib import Path

from alembic import command
from alembic.config import Config
from app.db import make_engine
from sqlalchemy import inspect, text

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def test_upgrade_head_creates_plan_tables(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'app.db'}"
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    tables = set(inspect(make_engine(url)).get_table_names())
    assert {
        "runs",
        "captures",
        "findings",
        "coverage",
        "eval_runs",
        "study_sessions",
        "study_tasks",
        "sus_responses",
    } <= tables


def test_0004_adds_decision_columns_and_maps_ignored_to_dismissed(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'app.db'}"
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "0003")
    engine = make_engine(url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO runs (id, created_at, source_kind, source, viewports, condition,"
                " status, stage_status, versions) VALUES ('r', '2026-01-01', 'url', 'x', '[]',"
                " 'hybrid', 'done', '{}', '{}')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO captures (id, run_id, viewport, path, meta, page_features)"
                " VALUES (1, 'r', 'mobile', 'p', '{}', '{}')"
            )
        )
        for i, status in enumerate(("ignored", "fixed", "open")):
            conn.execute(
                text(
                    "INSERT INTO findings (capture_id, key, sc, severity, tier, score, provenance,"
                    " evidence, guidance_key, status) VALUES (1, :k, '1.4.3', 'minor', 'automated',"
                    " 1.0, 'rule', '{}', 'g', :s)"
                ),
                {"k": f"f{i}", "s": status},
            )
    command.upgrade(cfg, "head")
    columns = {c["name"] for c in inspect(engine).get_columns("findings")}
    assert {"decision_reason", "decision_note", "decided_at", "decided_by"} <= columns
    with engine.connect() as conn:
        rows = {k: v for k, v in conn.execute(text("SELECT key, status FROM findings"))}
    assert rows == {"f0": "dismissed", "f1": "fixed", "f2": "open"}
    command.downgrade(cfg, "0003")
    with engine.connect() as conn:
        statuses = {k: v for k, v in conn.execute(text("SELECT key, status FROM findings"))}
        assert statuses["f0"] == "ignored"


def test_0005_adds_nullable_max_focus_steps_and_keeps_old_runs_null(tmp_path: Path) -> None:
    url = f"sqlite:///{tmp_path / 'app.db'}"
    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "0004")
    engine = make_engine(url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO runs (id, created_at, source_kind, source, viewports, condition,"
                " status, stage_status, versions) VALUES ('r', '2026-01-01', 'url', 'x', '[]',"
                " 'hybrid', 'done', '{}', '{}')"
            )
        )
    command.upgrade(cfg, "head")
    columns = {c["name"]: c for c in inspect(engine).get_columns("runs")}
    assert columns["max_focus_steps"]["nullable"] is True
    with engine.begin() as conn:
        assert conn.execute(text("SELECT max_focus_steps FROM runs")).scalar() is None
