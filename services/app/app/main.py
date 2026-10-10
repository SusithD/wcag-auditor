from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI

from app.config import Settings
from app.db import make_engine, make_session_factory
from app.jobs import JobRunner

ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        cfg.data_dir.mkdir(parents=True, exist_ok=True)
        cfg_alembic = Config(str(ALEMBIC_INI))
        cfg_alembic.set_main_option("sqlalchemy.url", cfg.db_url)
        command.upgrade(cfg_alembic, "head")
        engine = make_engine(cfg.db_url)
        app.state.engine = engine
        app.state.sessions = make_session_factory(engine)
        runner = JobRunner()
        runner.start()
        app.state.jobs = runner
        try:
            yield
        finally:
            await runner.stop()
            engine.dispose()

    app = FastAPI(title="wcag-auditor", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
