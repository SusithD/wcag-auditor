# ruff: noqa: E501
from __future__ import annotations

import csv
import hmac
import io
import re
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import study as st
from app.config import Settings
from app.jobs import Job, auditor_argv
from app.models import Run, StudyRun, StudySession, StudyTask, SusResponse

_prepare_lock = threading.Lock()
CODE = re.compile(r"^[A-Za-z0-9_-]{2,24}$")
StepKind = Literal["consent", "demographics", "task", "sus", "break", "debrief", "done"]


class Materials(BaseModel):
    opening: list[str]
    consent_statements: list[str]
    optional_consents: dict[str, str]
    demographics: dict[str, list[str]]
    sus_items: list[str]
    debrief_questions: list[str]
    closing: list[str]


class StudyConfig(BaseModel):
    ethics_approved: bool
    real_participants_enabled: bool
    prepared: int
    total_runs: int


class StepInfo(BaseModel):
    kind: StepKind
    task_index: int | None = None
    block: int | None = None
    position_in_block: int | None = None
    block_size: int = st.BLOCK_SIZE


class TaskSummary(BaseModel):
    task_index: int
    block: int
    status: Literal["pending", "open", "submitted"]


class SessionState(BaseModel):
    code: str
    synthetic: bool
    step: int
    total_steps: int
    next: StepInfo
    tasks: list[TaskSummary]
    block_condition: Literal["rule_only", "hybrid"] | None


class SessionCreate(BaseModel):
    code: str


class Consent(BaseModel):
    statements: list[bool] = Field(min_length=6, max_length=6)
    optional: dict[str, bool] = Field(default_factory=dict)


class Demographics(BaseModel):
    answers: dict[str, str]


class TaskView(BaseModel):
    task_index: int
    block: int
    position_in_block: int
    block_size: int
    brief: str
    condition: Literal["rule_only", "hybrid"]
    run_id: str
    viewport: Literal["desktop", "mobile"]


class FixSubmission(BaseModel):
    fix_text: str = Field(min_length=1, max_length=20000)


class SusSubmission(BaseModel):
    scores: list[int] = Field(min_length=10, max_length=10)


class DebriefSubmission(BaseModel):
    answers: list[str] = Field(min_length=3, max_length=3)


class Prepared(BaseModel):
    queued: int
    ready: int
    total: int


class AdminTask(BaseModel):
    id: int
    participant_code: str
    synthetic: bool
    task_index: int
    block: int
    task_id: str
    sc: str
    condition: str
    seconds: float | None
    fix_text: str | None
    success: bool | None
    notes: str | None
    rubric: dict[str, Any]
    reported_by_condition: bool


class AdminRun(BaseModel):
    task_id: str
    condition: str
    run_id: str


class RatingPatch(BaseModel):
    success: bool | None = None
    notes: str | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def _seconds(t: StudyTask) -> float | None:
    if t.opened_at is None or t.submitted_at is None:
        return None
    return (t.submitted_at - t.opened_at).total_seconds()


def build_study_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/study")
    study = st.Study(settings.study_path)
    sequence = st.steps()

    def admin(x_study_token: Annotated[str | None, Header()] = None) -> None:
        token = settings.study_admin_token
        if token is None:
            raise HTTPException(
                403, "Study administration is disabled: STUDY_ADMIN_TOKEN is not set"
            )
        if x_study_token is None or not hmac.compare_digest(x_study_token.encode(), token.encode()):
            raise HTTPException(403, "Wrong study administration token")

    def load(session: Session, code: str) -> tuple[StudySession, st.Assignment]:
        assignment = study.assignments.get(code)
        row = session.scalars(
            select(StudySession).where(StudySession.participant_code == code)
        ).first()
        if assignment is None or row is None:
            raise HTTPException(404, "Unknown participant code")
        if not assignment.synthetic and not settings.study_ethics_approved:
            raise HTTPException(
                403, "Real participants are not enabled: ethics approval is not recorded"
            )
        return row, assignment

    def state(session: Session, row: StudySession, a: st.Assignment) -> SessionState:
        current = sequence[row.step]
        tasks = session.scalars(
            select(StudyTask).where(StudyTask.session_id == row.id).order_by(StudyTask.task_index)
        ).all()
        by_index = {t.task_index: t for t in tasks}
        summaries = []
        for index in range(1, 2 * st.BLOCK_SIZE + 1):
            t = by_index.get(index)
            status: Literal["pending", "open", "submitted"] = "pending"
            if t is not None and t.submitted_at is not None:
                status = "submitted"
            elif t is not None and t.opened_at is not None:
                status = "open"
            summaries.append(
                TaskSummary(
                    task_index=index, block=1 if index <= st.BLOCK_SIZE else 2, status=status
                )
            )
        block = current.block or (
            1
            if current.kind in {"consent", "demographics"}
            else 2
            if current.kind in {"break", "debrief", "done"}
            else None
        )
        info = StepInfo(kind=current.kind, task_index=current.task_index, block=current.block)
        if current.kind == "task" and current.task_index:
            info.position_in_block = (current.task_index - 1) % st.BLOCK_SIZE + 1
        return SessionState(
            code=row.participant_code,
            synthetic=row.synthetic,
            step=row.step,
            total_steps=len(sequence),
            next=info,
            tasks=summaries,
            block_condition=a.conditions[(block or 1) - 1]
            if block and current.kind in {"task", "sus"}
            else None,
        )

    def require(row: StudySession, kind: str, **match: int) -> st.Step:
        current = sequence[row.step]
        if current.kind != kind or any(getattr(current, k) != v for k, v in match.items()):
            raise HTTPException(409, f"This step is not available now (expected {current.kind})")
        return current

    def advance(row: StudySession) -> None:
        row.step = min(row.step + 1, len(sequence) - 1)
        if sequence[row.step].kind == "done":
            row.completed_at = _now()

    @router.get("/materials", response_model=Materials)
    def materials() -> Materials:
        return Materials(
            opening=[
                "Thank you for taking part today. This session will take about 60 to 90 minutes. "
                "You will work through eight small tasks. For each task you will see a web page and an accessibility report. "
                "Your job is to propose a fix for any issue the report lists: you can write the code fix directly, or describe in words what you would change.",
                "There are no right or wrong answers. I am evaluating the report, not you. If anything is unclear at any point, please ask. If you feel uncomfortable at any time, we can stop.",
            ],
            consent_statements=st.CONSENT_STATEMENTS,
            optional_consents=st.OPTIONAL_CONSENTS,
            demographics=st.DEMOGRAPHICS,
            sus_items=st.SUS_ITEMS,
            debrief_questions=st.DEBRIEF_QUESTIONS,
            closing=[
                "The purpose of this study was to compare a rule-only accessibility report against a new hybrid report that combines the rule scanner with a machine-learning component. Everyone in the study saw both reports, so the results depend on comparing the same person's performance under each condition.",
                "Your name is only recorded on your consent form and on a separate contact list. The data analysed is labelled with a pseudonym. If you want to withdraw your data, you can email the researcher within 30 days of today.",
            ],
        )

    @router.get("/config", response_model=StudyConfig)
    def config(request: Request) -> StudyConfig:
        with request.app.state.sessions() as session:
            ready = _ready_count(session)
        return StudyConfig(
            ethics_approved=settings.study_ethics_approved,
            real_participants_enabled=settings.study_ethics_approved,
            prepared=ready,
            total_runs=len(study.tasks) * len(st.CONDITIONS),
        )

    def _ready_count(session: Session) -> int:
        return len(
            session.scalars(
                select(StudyRun.run_id)
                .join(Run, Run.id == StudyRun.run_id)
                .where(Run.status == "done")
            ).all()
        )

    @router.post("/prepare", response_model=Prepared, dependencies=[Depends(admin)])
    def prepare(request: Request) -> Prepared:
        with _prepare_lock, request.app.state.sessions() as session:
            existing = {(r.task_id, r.condition): r for r in session.scalars(select(StudyRun))}
            planned: list[tuple[st.Task, str, Path]] = []
            for task in study.tasks.values():
                folder = (Path(__file__).resolve().parents[3] / task.folder).resolve()
                if not (folder / "meta.json").is_file():
                    raise HTTPException(422, f"Task {task.id}: capture folder is missing")
                for condition in st.CONDITIONS:
                    sr = existing.get((task.id, condition))
                    if sr is not None:
                        run = session.get(Run, sr.run_id)
                        if run is not None and run.status in {"done", "queued", "running"}:
                            continue
                        session.delete(sr)
                        session.flush()
                    planned.append((task, condition, folder))
            jobs: list[Job] = []
            for task, condition, folder in planned:
                run_id = uuid.uuid4().hex
                out = settings.runs_dir / run_id
                out.mkdir(parents=True)
                argv = auditor_argv(
                    "audit", "--out", str(out), "--condition", condition,
                    "--folder", str(folder), "--no-pdf",
                )  # fmt: skip
                session.add(
                    Run(
                        id=run_id, source_kind="folder", source=f"study task {run_id[:8]}",
                        viewports=["desktop"], condition=condition, status="queued",
                        stage_status={},
                    )
                )  # fmt: skip
                session.add(StudyRun(task_id=task.id, condition=condition, run_id=run_id))
                jobs.append(Job(run_id, argv))
            session.commit()
            for job in jobs:
                request.app.state.jobs.submit(job)
            ready = _ready_count(session)
        return Prepared(queued=len(jobs), ready=ready, total=len(study.tasks) * len(st.CONDITIONS))

    @router.post("/sessions", response_model=SessionState)
    def create_session(body: SessionCreate, request: Request) -> SessionState:
        code = body.code.strip()
        if not CODE.match(code):
            raise HTTPException(422, "A participant code has letters, digits, - or _ (2 to 24)")
        assignment = study.assignments.get(code)
        if assignment is None:
            raise HTTPException(404, "Unknown participant code")
        if not assignment.synthetic and not settings.study_ethics_approved:
            raise HTTPException(
                403, "Real participants are not enabled: ethics approval is not recorded"
            )
        with request.app.state.sessions() as session:
            row = session.scalars(
                select(StudySession).where(StudySession.participant_code == code)
            ).first()
            if row is None:
                if _ready_count(session) < len(study.tasks) * len(st.CONDITIONS):
                    raise HTTPException(409, "The study pages are still being prepared")
                row = StudySession(
                    participant_code=code,
                    order=assignment.order,
                    synthetic=assignment.synthetic,
                    started_at=_now(),
                    step=0,
                )
                try:
                    session.add(row)
                    session.flush()
                    for index in range(1, 2 * st.BLOCK_SIZE + 1):
                        task = study.task_for(assignment, index)
                        session.add(
                            StudyTask(
                                session_id=row.id,
                                task_id=task.id,
                                condition=study.condition_for(assignment, index),
                                task_index=index,
                                block=1 if index <= st.BLOCK_SIZE else 2,
                            )
                        )
                    session.commit()
                except IntegrityError:
                    session.rollback()
                    row = session.scalars(
                        select(StudySession).where(StudySession.participant_code == code)
                    ).one()
            return state(session, row, assignment)

    @router.get("/sessions/{code}", response_model=SessionState)
    def get_session(code: str, request: Request) -> SessionState:
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            return state(session, row, a)

    @router.post("/sessions/{code}/consent", response_model=SessionState)
    def give_consent(code: str, body: Consent, request: Request) -> SessionState:
        if not all(body.statements):
            raise HTTPException(422, "Every required statement must be confirmed to take part")
        unknown = set(body.optional) - set(st.OPTIONAL_CONSENTS)
        if unknown:
            raise HTTPException(422, f"Unknown optional consent: {sorted(unknown)}")
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "consent")
            row.consent = {"statements": body.statements, "optional": body.optional}
            row.consent_at = _now()
            advance(row)
            session.commit()
            return state(session, row, a)

    @router.post("/sessions/{code}/demographics", response_model=SessionState)
    def give_demographics(code: str, body: Demographics, request: Request) -> SessionState:
        for key, options in st.DEMOGRAPHICS.items():
            if body.answers.get(key) not in options:
                raise HTTPException(422, f"Choose an option for {key}")
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "demographics")
            row.demographics = {k: body.answers[k] for k in st.DEMOGRAPHICS}
            advance(row)
            session.commit()
            return state(session, row, a)

    def get_task(session: Session, row: StudySession, index: int) -> StudyTask:
        task = session.scalars(
            select(StudyTask).where(StudyTask.session_id == row.id, StudyTask.task_index == index)
        ).first()
        if task is None:
            raise HTTPException(404, "Unknown task")
        return task

    @router.post("/sessions/{code}/tasks/{index}/open", response_model=TaskView)
    def open_task(code: str, index: int, request: Request) -> TaskView:
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "task", task_index=index)
            task = get_task(session, row, index)
            sr = session.get(StudyRun, (task.task_id, task.condition))
            if sr is None:
                raise HTTPException(409, "The study pages are not prepared")
            if task.opened_at is None:
                task.opened_at = _now()
                session.commit()
            return TaskView(
                task_index=index,
                block=task.block,
                position_in_block=(index - 1) % st.BLOCK_SIZE + 1,
                block_size=st.BLOCK_SIZE,
                brief=study.tasks[task.task_id].brief,
                condition=task.condition,
                run_id=sr.run_id,
                viewport="desktop",
            )

    @router.post("/sessions/{code}/tasks/{index}/submit", response_model=SessionState)
    def submit_task(code: str, index: int, body: FixSubmission, request: Request) -> SessionState:
        text = body.fix_text.strip()
        if not text:
            raise HTTPException(422, "Write or describe your proposed fix before you finish")
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "task", task_index=index)
            task = get_task(session, row, index)
            if task.opened_at is None:
                raise HTTPException(409, "Open the task before submitting")
            if task.submitted_at is not None:
                raise HTTPException(409, "This task was already submitted")
            task.submitted_at = _now()
            task.fix_text = text
            advance(row)
            session.commit()
            return state(session, row, a)

    @router.post("/sessions/{code}/sus/{block}", response_model=SessionState)
    def submit_sus(code: str, block: int, body: SusSubmission, request: Request) -> SessionState:
        if any(not 1 <= s <= 5 for s in body.scores):
            raise HTTPException(422, "Every item needs an answer from 1 to 5")
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "sus", block=block)
            condition = a.conditions[block - 1]
            for item, score in enumerate(body.scores, start=1):
                session.add(
                    SusResponse(
                        session_id=row.id, block=block, item=item, condition=condition, score=score
                    )
                )
            advance(row)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                raise HTTPException(409, "This questionnaire was already submitted") from None
            return state(session, row, a)

    @router.post("/sessions/{code}/break", response_model=SessionState)
    def finish_break(code: str, request: Request) -> SessionState:
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "break")
            advance(row)
            session.commit()
            return state(session, row, a)

    @router.post("/sessions/{code}/debrief", response_model=SessionState)
    def submit_debrief(code: str, body: DebriefSubmission, request: Request) -> SessionState:
        with request.app.state.sessions() as session:
            row, a = load(session, code)
            require(row, "debrief")
            row.debrief = {
                f"q{i}": text.strip()[:5000] for i, text in enumerate(body.answers, start=1)
            }
            advance(row)
            session.commit()
            return state(session, row, a)

    def reported(task: st.Task, condition: str) -> bool:
        return condition in task.rubric.get("reported_by", [])

    @router.get("/admin/runs", response_model=list[AdminRun], dependencies=[Depends(admin)])
    def admin_runs(request: Request) -> list[AdminRun]:
        with request.app.state.sessions() as session:
            return [
                AdminRun(task_id=r.task_id, condition=r.condition, run_id=r.run_id)
                for r in session.scalars(
                    select(StudyRun).order_by(StudyRun.task_id, StudyRun.condition)
                )
            ]

    @router.get("/admin/tasks", response_model=list[AdminTask], dependencies=[Depends(admin)])
    def admin_tasks(request: Request) -> list[AdminTask]:
        with request.app.state.sessions() as session:
            out = []
            for t, s in session.execute(
                select(StudyTask, StudySession)
                .join(StudySession, StudySession.id == StudyTask.session_id)
                .order_by(StudySession.participant_code, StudyTask.task_index)
            ):
                task = study.tasks[t.task_id]
                out.append(
                    AdminTask(
                        id=t.id, participant_code=s.participant_code, synthetic=s.synthetic,
                        task_index=t.task_index, block=t.block, task_id=t.task_id, sc=task.sc,
                        condition=t.condition, seconds=_seconds(t), fix_text=t.fix_text,
                        success=t.success, notes=t.notes, rubric=task.rubric,
                        reported_by_condition=reported(task, t.condition),
                    )
                )  # fmt: skip
            return out

    @router.patch(
        "/admin/tasks/{task_row_id}", response_model=AdminTask, dependencies=[Depends(admin)]
    )
    def rate_task(task_row_id: int, body: RatingPatch, request: Request) -> AdminTask:
        with request.app.state.sessions() as session:
            t = session.get(StudyTask, task_row_id)
            if t is None:
                raise HTTPException(404, "Unknown task row")
            t.success, t.notes = body.success, body.notes
            session.commit()
            s = session.get(StudySession, t.session_id)
            assert s is not None
            task = study.tasks[t.task_id]
            return AdminTask(
                id=t.id, participant_code=s.participant_code, synthetic=s.synthetic,
                task_index=t.task_index, block=t.block, task_id=t.task_id, sc=task.sc,
                condition=t.condition, seconds=_seconds(t), fix_text=t.fix_text,
                success=t.success, notes=t.notes, rubric=task.rubric,
                reported_by_condition=reported(task, t.condition),
            )  # fmt: skip

    def _csv(rows: list[dict[str, Any]], fields: list[str]) -> PlainTextResponse:
        out = io.StringIO()
        writer = csv.DictWriter(out, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: _cell(v) for k, v in r.items()})
        return PlainTextResponse(out.getvalue(), media_type="text/csv")

    def _cell(value: Any) -> Any:
        text = "" if value is None else str(value)
        return "'" + text if text.lstrip()[:1] in {"=", "+", "-", "@", "\t", "\r", "\n"} else value

    @router.get("/admin/export/{kind}.csv", dependencies=[Depends(admin)])
    def export(kind: Literal["sessions", "tasks", "sus"], request: Request) -> PlainTextResponse:
        with request.app.state.sessions() as session:
            sessions = session.scalars(
                select(StudySession).order_by(StudySession.participant_code)
            ).all()
            if kind == "sessions":
                rows = []
                for s in sessions:
                    cons = s.consent.get("optional", {})
                    rows.append(
                        {
                            "participant_code": s.participant_code, "synthetic": int(s.synthetic),
                            "order": s.order, "consent_at": _iso(s.consent_at),
                            "started_at": _iso(s.started_at), "completed_at": _iso(s.completed_at),
                            **{f"optional_{k}": int(bool(cons.get(k))) for k in st.OPTIONAL_CONSENTS},
                            **{k: s.demographics.get(k) for k in st.DEMOGRAPHICS},
                            **{f"debrief_{k}": s.debrief.get(k) for k in ("q1", "q2", "q3")},
                        }
                    )  # fmt: skip
                fields = list(rows[0]) if rows else ["participant_code"]
                return _csv(rows, fields)
            if kind == "tasks":
                tasks = admin_tasks(request)
                by_id = {s.participant_code: s for s in sessions}
                rows = [
                    {
                        "participant_code": t.participant_code, "synthetic": int(t.synthetic),
                        "order": by_id[t.participant_code].order, "block": t.block,
                        "task_index": t.task_index, "task_id": t.task_id, "sc": t.sc,
                        "condition": t.condition, "seconds": t.seconds, "fix_text": t.fix_text,
                        "success": None if t.success is None else int(t.success), "notes": t.notes,
                        "reported_by_condition": int(t.reported_by_condition),
                        "rubric_issue": t.rubric.get("issue"),
                        "rubric_expected_fix": t.rubric.get("expected_fix"),
                        "rubric_success_criteria": t.rubric.get("success_criteria"),
                        "rubric_partial_credit": t.rubric.get("partial_credit"),
                    }
                    for t in tasks
                ]  # fmt: skip
                return _csv(rows, TASK_FIELDS)
            rows = []
            for s in sessions:
                for block in (1, 2):
                    answers = {
                        r.item: r
                        for r in session.scalars(
                            select(SusResponse).where(
                                SusResponse.session_id == s.id, SusResponse.block == block
                            )
                        )
                    }
                    if len(answers) != 10:
                        continue
                    scores = [answers[i].score for i in range(1, 11)]
                    rows.append(
                        {
                            "participant_code": s.participant_code, "synthetic": int(s.synthetic),
                            "block": block, "condition": answers[1].condition,
                            **{f"item_{i}": v for i, v in enumerate(scores, start=1)},
                            "sus_score": st.sus_score(scores),
                        }
                    )  # fmt: skip
            return _csv(rows, SUS_FIELDS)

    return router


def _iso(value: datetime | None) -> str | None:
    return value.isoformat(timespec="seconds") if value else None


TASK_FIELDS = [
    "participant_code", "synthetic", "order", "block", "task_index", "task_id", "sc",
    "condition", "seconds", "fix_text", "success", "notes", "reported_by_condition",
    "rubric_issue", "rubric_expected_fix", "rubric_success_criteria", "rubric_partial_credit",
]  # fmt: skip
SUS_FIELDS = [
    "participant_code", "synthetic", "block", "condition",
    *[f"item_{i}" for i in range(1, 11)], "sus_score",
]  # fmt: skip
