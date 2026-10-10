from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[Any]: JSON}


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    source_kind: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(Text)
    viewports: Mapped[list[Any]]
    condition: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="queued")
    stage_status: Mapped[dict[str, Any]] = mapped_column(default=dict)
    versions: Mapped[dict[str, Any]] = mapped_column(default=dict)
    protocol_sha: Mapped[str | None] = mapped_column(String)
    error: Mapped[str | None] = mapped_column(Text)


class CaptureRow(Base):
    __tablename__ = "captures"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    viewport: Mapped[str] = mapped_column(String)
    path: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(default=dict)
    page_features: Mapped[dict[str, Any]] = mapped_column(default=dict)


class FindingRow(Base):
    __tablename__ = "findings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    capture_id: Mapped[int] = mapped_column(
        ForeignKey("captures.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str | None] = mapped_column(String, index=True)
    sc: Mapped[str] = mapped_column(String)
    bbox: Mapped[dict[str, Any] | None]
    focus_index: Mapped[int | None]
    severity: Mapped[str] = mapped_column(String)
    tier: Mapped[str] = mapped_column(String)
    score: Mapped[float] = mapped_column(Float)
    provenance: Mapped[str] = mapped_column(String)
    evidence: Mapped[dict[str, Any]] = mapped_column(default=dict)
    guidance_key: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="open")


class CoverageRow(Base):
    __tablename__ = "coverage"

    capture_id: Mapped[int] = mapped_column(
        ForeignKey("captures.id", ondelete="CASCADE"), primary_key=True
    )
    sc: Mapped[str] = mapped_column(String, primary_key=True)
    rule_verdict: Mapped[str] = mapped_column(String)
    pixel_verdict: Mapped[str] = mapped_column(String)
    hybrid_verdict: Mapped[str] = mapped_column(String)


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    benchmark_sha: Mapped[str | None] = mapped_column(String)
    truth_sha: Mapped[str | None] = mapped_column(String)
    protocol_sha: Mapped[str | None] = mapped_column(String)
    config: Mapped[dict[str, Any]] = mapped_column(default=dict)
    metrics: Mapped[dict[str, Any]] = mapped_column(default=dict)


class StudySession(Base):
    __tablename__ = "study_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    participant_code: Mapped[str] = mapped_column(String, unique=True)
    order: Mapped[str] = mapped_column(String)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    step: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent: Mapped[dict[str, Any]] = mapped_column(default=dict)
    demographics: Mapped[dict[str, Any]] = mapped_column(default=dict)
    debrief: Mapped[dict[str, Any]] = mapped_column(default=dict)


class StudyTask(Base):
    __tablename__ = "study_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[str] = mapped_column(String)
    condition: Mapped[str] = mapped_column(String)
    task_index: Mapped[int] = mapped_column(Integer, default=0)
    block: Mapped[int] = mapped_column(Integer, default=1)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fix_text: Mapped[str | None] = mapped_column(Text)
    success: Mapped[bool | None]
    notes: Mapped[str | None] = mapped_column(Text)


class SusResponse(Base):
    __tablename__ = "sus_responses"

    session_id: Mapped[int] = mapped_column(
        ForeignKey("study_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    block: Mapped[int] = mapped_column(Integer, primary_key=True)
    item: Mapped[int] = mapped_column(Integer, primary_key=True)
    condition: Mapped[str] = mapped_column(String)
    score: Mapped[int] = mapped_column(Integer)


class StudyRun(Base):
    __tablename__ = "study_runs"

    task_id: Mapped[str] = mapped_column(String, primary_key=True)
    condition: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(String)
