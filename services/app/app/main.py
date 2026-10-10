from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from sqlalchemy import select

from app.api import build_router, status_from_result
from app.config import Settings
from app.db import make_engine, make_session_factory
from app.eval_api import build_eval_router, fail_eval, finish_eval, import_dirs, mark_running
from app.ingest import ingest_run
from app.jobs import JobResult, JobRunner
from app.models import EvalRun, Run
from app.report_api import build_report_router

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
        sessions = app.state.sessions
        with sessions() as session:
            for row in session.scalars(select(Run).where(Run.status.in_(["queued", "running"]))):
                row.status, row.error = "failed", "Interrupted by a service restart"
            session.commit()

        with sessions() as session:
            import_dirs(session, cfg.eval_import_dirs)
            for er in session.scalars(select(EvalRun)):
                if er.config.get("status") in {"queued", "running"}:
                    er.config = {
                        **er.config,
                        "status": "failed",
                        "error": "Interrupted by a service restart",
                    }
            session.commit()

        async def on_start(run_id: str) -> None:
            if run_id.startswith("eval-"):
                with sessions() as session:
                    mark_running(session, int(run_id[5:]))
                return
            with sessions() as session:
                row = session.get(Run, run_id)
                if row is not None:
                    row.status = "running"
                    session.commit()

        async def on_finish(result: JobResult) -> None:
            if result.run_id.startswith("eval-"):
                try:
                    with sessions() as session:
                        finish_eval(
                            session, int(result.run_id[5:]), result.returncode, result.output
                        )
                except Exception:
                    logging.getLogger(__name__).exception("finishing %s failed", result.run_id)
                    with sessions() as session:
                        fail_eval(session, int(result.run_id[5:]))
                return
            status, error = status_from_result(result, cfg.runs_dir / result.run_id)
            with sessions() as session:
                row = session.get(Run, result.run_id)
                if row is not None:
                    row.status, row.error = status, error
                    session.commit()
                if status in {"done", "partial"}:
                    try:
                        ingest_run(session, result.run_id, cfg.runs_dir / result.run_id)
                    except Exception:
                        session.rollback()
                        logging.getLogger(__name__).exception("ingest of %s failed", result.run_id)

        runner = JobRunner(on_finish, on_start, cfg.job_timeout_s)
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

    app.include_router(build_report_router(cfg))
    app.include_router(build_eval_router(cfg))
    app.include_router(build_router(cfg))
    return app


app = create_app()
