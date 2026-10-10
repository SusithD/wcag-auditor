from pathlib import Path

from alembic import command
from alembic.config import Config
from app.db import make_engine
from sqlalchemy import inspect

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
