from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import threading
from collections.abc import AsyncIterator
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalogue import Catalogue
from app.catalogue import load as load_catalogue
from app.config import Settings
from app.jobs import Job, auditor_argv
from app.models import EvalRun

EvalCondition = Literal["rule_only", "pixel", "hybrid"]
EvalStatus = Literal["queued", "running", "done", "failed"]
STRATA = ("real", "synthetic", "combined")
log = logging.getLogger(__name__)
_start_lock = threading.Lock()


def _all_conditions() -> list[EvalCondition]:
    return ["rule_only", "pixel", "hybrid"]


class EvalRequest(BaseModel):
    conditions: list[EvalCondition] = Field(default_factory=_all_conditions, min_length=1)

    @field_validator("conditions")
    @classmethod
    def _unique(cls, value: list[EvalCondition]) -> list[EvalCondition]:
        return list(dict.fromkeys(value))

    include_needs_review: bool = True
    bootstrap: int = Field(default=10000, ge=100, le=100000)


class EvalCell(BaseModel):
    condition: str
    stratum: str
    sc: str
    tp: int
    fp: int
    fn: int
    duplicates: int
    precision: float | None
    recall: float | None
    f1: float | None
    precision_ci: list[float] | None
    recall_ci: list[float] | None
    f1_ci: list[float] | None


class McNemarRow(BaseModel):
    stratum: str
    sc: str
    both_correct: int
    only_a_correct: int
    only_b_correct: int
    both_wrong: int
    p_value: float | None
    p_adjusted: float | None
    note: str | None


class DeltaRow(BaseModel):
    stratum: str
    sc: str
    low: float | None
    high: float | None
    margin: float
    non_inferior: bool | None


class EvalMeta(BaseModel):
    items_scored: int
    items_unlabelled: int
    seed: int
    resamples: int
    conditions: list[str]
    include_needs_review: bool
    benchmark_sha: str | None
    truth_sha: str | None
    protocol_sha: str | None
    rule_only_scs: list[str]


class EvalView(BaseModel):
    meta: EvalMeta
    cells: list[EvalCell]
    mcnemar_a: str | None
    mcnemar_b: str | None
    mcnemar: list[McNemarRow]
    delta_precision: list[DeltaRow]


class EvalSummary(BaseModel):
    id: int
    created_at: datetime
    status: EvalStatus
    source: Literal["run", "import"]
    conditions: list[str]
    error: str | None
    done: int | None
    total: int | None


class EvalDetail(BaseModel):
    summary: EvalSummary
    view: EvalView | None


class EvalCreated(BaseModel):
    eval_id: int


def _ci(entry: dict[str, Any] | None) -> list[float] | None:
    if not entry or entry.get("low") is None or entry.get("high") is None:
        return None
    return [float(entry["low"]), float(entry["high"])]


def to_view(metrics: dict[str, Any]) -> EvalView:
    meta = metrics["meta"]
    ci = metrics.get("bootstrap", {}).get("ci", {})
    cells: list[EvalCell] = []
    for condition, strata in metrics["metrics"].items():
        for stratum, by_sc in strata.items():
            for sc, m in by_sc.items():
                c = ci.get(condition, {}).get(stratum, {}).get(sc, {})
                cells.append(
                    EvalCell(
                        condition=condition,
                        stratum=stratum,
                        sc=sc,
                        tp=m["tp"],
                        fp=m["fp"],
                        fn=m["fn"],
                        duplicates=m.get("duplicates", 0),
                        precision=m["precision"],
                        recall=m["recall"],
                        f1=m["f1"],
                        precision_ci=_ci(c.get("precision")),
                        recall_ci=_ci(c.get("recall")),
                        f1_ci=_ci(c.get("f1")),
                    )
                )
    mc = metrics.get("mcnemar", {})
    rows: list[McNemarRow] = []
    for stratum, by_sc in mc.get("tests", {}).items():
        for sc, t in by_sc.items():
            rows.append(
                McNemarRow(
                    stratum=stratum,
                    sc=sc,
                    both_correct=t["both_correct"],
                    only_a_correct=t["only_a_correct"],
                    only_b_correct=t["only_b_correct"],
                    both_wrong=t["both_wrong"],
                    p_value=t.get("p_value"),
                    p_adjusted=mc.get("bh_adjusted", {}).get(stratum, {}).get(sc),
                    note=t.get("note"),
                )
            )
    deltas: list[DeltaRow] = []
    for stratum, by_sc in metrics.get("bootstrap", {}).get("delta_precision", {}).items():
        for sc, d in by_sc.items():
            deltas.append(
                DeltaRow(
                    stratum=stratum,
                    sc=sc,
                    low=d.get("low"),
                    high=d.get("high"),
                    margin=d["margin"],
                    non_inferior=d.get("non_inferior"),
                )
            )
    return EvalView(
        meta=EvalMeta(
            items_scored=meta["items_scored"],
            items_unlabelled=meta["items_unlabelled"],
            seed=meta["seed"],
            resamples=meta["bootstrap_resamples"],
            conditions=list(meta["conditions"]),
            include_needs_review=bool(meta["include_needs_review"]),
            benchmark_sha=meta.get("benchmark_sha"),
            truth_sha=meta.get("truth_sha"),
            protocol_sha=meta.get("protocol_sha"),
            rule_only_scs=list(metrics.get("coverage", {}).get("rule_only", {}).get("scs", [])),
        ),
        cells=cells,
        mcnemar_a=mc.get("a"),
        mcnemar_b=mc.get("b"),
        mcnemar=rows,
        delta_precision=deltas,
    )


def cells_csv(view: EvalView, condition: str, stratum: str) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(
        ["sc", "tp", "fp", "fn", "duplicates", "precision", "recall", "f1",
         "precision_low", "precision_high", "recall_low", "recall_high", "f1_low", "f1_high"]
    )  # fmt: skip
    for c in view.cells:
        if c.condition != condition or c.stratum != stratum:
            continue
        blank: list[Any] = ["", ""]
        pc: list[Any] = c.precision_ci or blank
        rc: list[Any] = c.recall_ci or blank
        fc: list[Any] = c.f1_ci or blank
        w.writerow(
            [c.sc, c.tp, c.fp, c.fn, c.duplicates, c.precision, c.recall, c.f1, *pc, *rc, *fc]
        )
    return out.getvalue()


def _progress(out: Path) -> tuple[int, int] | None:
    path = out / "progress.jsonl"
    if not path.is_file():
        return None
    last: tuple[int, int] | None = None
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            d = json.loads(line)
            last = (int(d["done"]), int(d["total"]))
        except (ValueError, KeyError):
            continue
    return last


def summarise(row: EvalRun) -> EvalSummary:
    cfg = row.config
    prog = (
        _progress(Path(cfg["out"])) if cfg.get("out") and cfg.get("status") == "running" else None
    )
    return EvalSummary(
        id=row.id,
        created_at=row.created_at,
        status=cfg.get("status", "done"),
        source=cfg.get("source", "run"),
        conditions=list(cfg.get("conditions", [])),
        error=cfg.get("error"),
        done=prog[0] if prog else None,
        total=prog[1] if prog else None,
    )


def import_dirs(session: Session, dirs: tuple[Path, ...]) -> None:
    known = {r.config.get("imported_from") for r in session.scalars(select(EvalRun))}
    for d in dirs:
        file = d / "metrics.json"
        if str(d) in known or not file.is_file():
            continue
        try:
            metrics = json.loads(file.read_text(encoding="utf-8"))
            meta = metrics["meta"]
            to_view(metrics)
        except (OSError, ValueError, KeyError, TypeError):
            log.warning("skipping unreadable evaluation in %s", d)
            continue
        session.add(
            EvalRun(
                benchmark_sha=meta.get("benchmark_sha"),
                truth_sha=meta.get("truth_sha"),
                protocol_sha=meta.get("protocol_sha"),
                config={
                    "source": "import",
                    "imported_from": str(d),
                    "status": "done",
                    "out": str(d),
                    "conditions": list(meta["conditions"]),
                },
                metrics=metrics,
            )
        )
    session.commit()


def finish_eval(session: Session, eval_id: int, returncode: int, output: str) -> None:
    row = session.get(EvalRun, eval_id)
    if row is None:
        return
    cfg = dict(row.config)
    metrics_file = Path(cfg["out"]) / "metrics.json"
    loaded: dict[str, Any] | None = None
    if returncode == 0 and metrics_file.is_file():
        try:
            loaded = json.loads(metrics_file.read_text(encoding="utf-8"))
            assert loaded is not None
            to_view(loaded)
        except (OSError, ValueError, KeyError, TypeError):
            log.exception("evaluation %s wrote unreadable metrics", eval_id)
            loaded = None
            output = "The evaluation wrote unreadable metrics"
    if loaded is not None:
        row.metrics = loaded
        meta = loaded["meta"]
        row.benchmark_sha, row.truth_sha = meta.get("benchmark_sha"), meta.get("truth_sha")
        row.protocol_sha = meta.get("protocol_sha")
        cfg["status"] = "done"
    else:
        cfg["status"], cfg["error"] = "failed", (output[-500:] or "The evaluation failed")
    row.config = cfg
    session.commit()


def fail_eval(session: Session, eval_id: int) -> None:
    row = session.get(EvalRun, eval_id)
    if row is not None:
        row.config = {
            **row.config,
            "status": "failed",
            "error": "The evaluation could not be finished",
        }
        session.commit()


def mark_running(session: Session, eval_id: int) -> None:
    row = session.get(EvalRun, eval_id)
    if row is not None:
        row.config = {**row.config, "status": "running"}
        session.commit()


def build_eval_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/catalogue", response_model=Catalogue)
    def catalogue() -> Catalogue:
        if not settings.catalogue_file.is_file():
            raise HTTPException(404, "The check catalogue is not available")
        return load_catalogue(settings.catalogue_file)

    @router.post("/eval", response_model=EvalCreated, status_code=201)
    def create_eval(body: EvalRequest, request: Request) -> EvalCreated:
        if settings.benchmark_dir is None or not settings.benchmark_dir.is_dir():
            raise HTTPException(422, "BENCHMARK_DIR is not configured on the service")
        if settings.truth_path is not None and not settings.truth_path.is_file():
            raise HTTPException(422, "TRUTH_PATH does not point to a file")
        with _start_lock, request.app.state.sessions() as session:
            if any(
                r.config.get("status") in {"queued", "running"}
                for r in session.scalars(select(EvalRun))
            ):
                raise HTTPException(409, "An evaluation is already running")
            row = EvalRun(config={}, metrics={})
            session.add(row)
            session.flush()
            out = settings.eval_dir / str(row.id)
            out.mkdir(parents=True, exist_ok=True)
            row.config = {
                "source": "run",
                "status": "queued",
                "out": str(out),
                "conditions": body.conditions,
                "include_needs_review": body.include_needs_review,
            }
            session.commit()
            eval_id = row.id
        argv = auditor_argv(
            "eval",
            "--benchmark", str(settings.benchmark_dir),
            "--synthetic-truth", "from-folders",
            "--conditions", ",".join(body.conditions),
            "--bootstrap", str(body.bootstrap),
            "--out", str(out),
            "--progress-file", str(out / "progress.jsonl"),
        )  # fmt: skip
        if settings.truth_path is not None:
            argv += ["--truth", str(settings.truth_path)]
        argv.append("--include-needs-review" if body.include_needs_review else "--automated-only")
        request.app.state.jobs.submit(Job(f"eval-{eval_id}", argv, settings.eval_timeout_s))
        return EvalCreated(eval_id=eval_id)

    @router.get("/eval", response_model=list[EvalSummary])
    def list_evals(request: Request) -> list[EvalSummary]:
        with request.app.state.sessions() as session:
            rows = session.scalars(select(EvalRun).order_by(EvalRun.id.desc())).all()
            return [summarise(r) for r in rows]

    def get_row(session: Session, eval_id: int) -> EvalRun:
        row = session.get(EvalRun, eval_id)
        if row is None:
            raise HTTPException(404, "Unknown evaluation")
        return row

    @router.get("/eval/{eval_id}", response_model=EvalDetail)
    def get_eval(eval_id: int, request: Request) -> EvalDetail:
        with request.app.state.sessions() as session:
            row = get_row(session, eval_id)
            view = to_view(row.metrics) if row.metrics else None
            return EvalDetail(summary=summarise(row), view=view)

    @router.get("/eval/{eval_id}/events")
    async def eval_events(eval_id: int, request: Request) -> StreamingResponse:
        with request.app.state.sessions() as session:
            get_row(session, eval_id)

        def snapshot() -> EvalSummary:
            with request.app.state.sessions() as session:
                return summarise(get_row(session, eval_id))

        async def stream() -> AsyncIterator[str]:
            while True:
                summary = await asyncio.to_thread(snapshot)
                yield f"event: progress\ndata: {summary.model_dump_json()}\n\n"
                if summary.status in {"done", "failed"}:
                    return
                if await request.is_disconnected():
                    return
                await asyncio.sleep(1)

        return StreamingResponse(
            stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
        )

    @router.get("/eval/{eval_id}/export.csv")
    def export_csv(
        eval_id: int, request: Request, condition: EvalCondition, stratum: str
    ) -> PlainTextResponse:
        if stratum not in STRATA:
            raise HTTPException(422, "Unknown stratum")
        with request.app.state.sessions() as session:
            row = get_row(session, eval_id)
            if not row.metrics:
                raise HTTPException(404, "No results yet")
            text = cells_csv(to_view(row.metrics), condition, stratum)
        name = f"eval-{eval_id}-{condition}-{stratum}.csv"
        return PlainTextResponse(
            text,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    @router.get("/eval/{eval_id}/export.tex")
    def export_tex(eval_id: int, request: Request) -> PlainTextResponse:
        with request.app.state.sessions() as session:
            row = get_row(session, eval_id)
            out = row.config.get("out")
        path = Path(out) / "tables.tex" if out else None
        if path is None or not path.is_file():
            raise HTTPException(404, "No LaTeX tables for this evaluation")
        return PlainTextResponse(
            path.read_text(encoding="utf-8"),
            media_type="application/x-tex",
            headers={"Content-Disposition": f'attachment; filename="eval-{eval_id}.tex"'},
        )

    return router
