from __future__ import annotations

import statistics
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from auditor import protocol
from auditor.geometry import iou
from auditor.schema import BBox
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import HEX, RunSummary, Viewport, summarise_run
from app.config import Settings
from app.models import CaptureRow, CoverageRow, FindingRow, Run, StudyRun
from app.report_api import FindingOut, _aware, _element, finding_out, load_report_lenient

FINISHED = ("done", "partial")
WAITING = {"open", "unsure"}
DECIDED = {"confirmed", "dismissed"}
GENERIC_ELEMENT = "Page region"


def site_of(run: Run) -> str:
    if run.source_kind == "url":
        parts = urlsplit(run.source)
        host = (parts.hostname or "").lower()
        return f"{host}{parts.path.rstrip('/')}"
    return run.source


def _finished_runs(session: Session) -> list[Run]:
    return list(
        session.scalars(
            select(Run)
            .where(Run.status.in_(FINISHED), Run.id.not_in(select(StudyRun.run_id)))
            .order_by(Run.created_at.desc())
        )
    )


def _by_site(runs: list[Run]) -> dict[str, list[Run]]:
    grouped: dict[str, list[Run]] = {}
    for run in runs:
        grouped.setdefault(site_of(run), []).append(run)
    return grouped


def _run_findings(session: Session, run_id: str) -> list[tuple[CaptureRow, FindingRow]]:
    rows = session.execute(
        select(CaptureRow, FindingRow)
        .join(FindingRow, FindingRow.capture_id == CaptureRow.id)
        .where(CaptureRow.run_id == run_id)
        .order_by(CaptureRow.viewport, FindingRow.key)
    )
    return [(c, f) for c, f in rows]


def _previous(grouped: dict[str, list[Run]], run: Run) -> Run | None:
    older = [r for r in grouped.get(site_of(run), []) if r.created_at < run.created_at]
    return older[0] if older else None


def _same_finding(a: FindingRow, b: FindingRow, iou_min: float) -> bool:
    if a.sc != b.sc:
        return False
    if a.focus_index is not None or b.focus_index is not None:
        return a.focus_index == b.focus_index
    element_a, element_b = _element(a.evidence), _element(b.evidence)
    if element_a == element_b and element_a != GENERIC_ELEMENT:
        return True
    if a.bbox is None or b.bbox is None:
        return False
    return iou(BBox(**a.bbox), BBox(**b.bbox)) >= iou_min


def _match(
    previous: list[FindingRow], current: list[FindingRow], iou_min: float
) -> tuple[list[tuple[FindingRow, FindingRow]], list[FindingRow], list[FindingRow]]:
    free = list(current)
    pairs: list[tuple[FindingRow, FindingRow]] = []
    gone: list[FindingRow] = []
    for old in previous:
        hit = next((c for c in free if _same_finding(old, c, iou_min)), None)
        if hit is None:
            gone.append(old)
        else:
            free.remove(hit)
            pairs.append((old, hit))
    return pairs, gone, free


class DeltaOut(BaseModel):
    run_id: str
    previous_run_id: str | None
    fixed: list[FindingOut]
    new: list[FindingOut]
    still_present: list[FindingOut]
    fixes_verified: list[FindingOut]


class ReviewItem(BaseModel):
    finding: FindingOut
    run_id: str
    source: str
    site: str
    viewport: Viewport
    created_at: datetime


class ReasonCount(BaseModel):
    reason: str | None
    count: int


class ReviewOut(BaseModel):
    items: list[ReviewItem]
    counts_by_reason: list[ReasonCount]
    total: int


class SiteRow(BaseModel):
    site: str
    latest_run: RunSummary
    previous_run_id: str | None
    failures: int
    failures_delta: int | None
    to_review: int
    criteria_decided: int


class RunningAudit(BaseModel):
    run_id: str
    source: str
    status: str
    stage_status: dict[str, Any]


class FixesToVerify(BaseModel):
    findings: int
    sites: int


class WeekSummary(BaseModel):
    audits_this_week: int
    audits_last_week: int
    fixes_verified_this_week: int
    decisions_this_week: int
    median_criteria_decided: float
    running: list[RunningAudit]
    fixes_to_verify: FixesToVerify


def _week_start(now: datetime) -> datetime:
    day = now.astimezone(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    return day - timedelta(days=day.weekday())


def _criteria_decided(session: Session, run: Run) -> int:
    column = (
        CoverageRow.rule_verdict if run.condition == "rule_only" else CoverageRow.hybrid_verdict
    )
    cells = session.scalars(
        select(CoverageRow.sc)
        .join(CaptureRow, CaptureRow.id == CoverageRow.capture_id)
        .where(CaptureRow.run_id == run.id, column == "automated")
    )
    return len(set(cells))


def build_workflow_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    def out(capture: CaptureRow, row: FindingRow) -> FindingOut:
        return finding_out(
            row, capture.viewport, load_report_lenient(Path(capture.path).parent, capture.viewport)
        )

    def delta_for(
        session: Session, run: Run, grouped: dict[str, list[Run]], iou_min: float
    ) -> DeltaOut:
        before = _previous(grouped, run)
        if before is None:
            return DeltaOut(
                run_id=run.id,
                previous_run_id=None,
                fixed=[],
                new=[],
                still_present=[],
                fixes_verified=[],
            )
        now_rows = _run_findings(session, run.id)
        old_rows = _run_findings(session, before.id)
        result = DeltaOut(
            run_id=run.id,
            previous_run_id=before.id,
            fixed=[],
            new=[],
            still_present=[],
            fixes_verified=[],
        )
        for viewport in sorted(
            {c.viewport for c, _ in now_rows} & {c.viewport for c, _ in old_rows}
        ):
            current = [(c, f) for c, f in now_rows if c.viewport == viewport]
            previous = [(c, f) for c, f in old_rows if c.viewport == viewport]
            pairs, gone, fresh = _match([f for _, f in previous], [f for _, f in current], iou_min)
            capture_of = {f.id: c for c, f in previous + current}
            result.fixed += [out(capture_of[f.id], f) for f in gone]
            result.fixes_verified += [out(capture_of[f.id], f) for f in gone if f.status == "fixed"]
            result.new += [out(capture_of[f.id], f) for f in fresh]
            result.still_present += [out(capture_of[new.id], new) for _, new in pairs]
        return result

    @router.get("/runs/{run_id}/delta", response_model=DeltaOut)
    def run_delta(run_id: str, request: Request) -> DeltaOut:
        if not HEX.match(run_id):
            raise HTTPException(404, "Unknown run")
        with request.app.state.sessions() as session:
            run = session.get(Run, run_id)
            if run is None:
                raise HTTPException(404, "Unknown run")
            grouped = _by_site(_finished_runs(session))
            if run.status not in FINISHED:
                return DeltaOut(
                    run_id=run_id,
                    previous_run_id=None,
                    fixed=[],
                    new=[],
                    still_present=[],
                    fixes_verified=[],
                )
            return delta_for(session, run, grouped, protocol.load().thresholds.match.iou)

    @router.get("/review", response_model=ReviewOut)
    def review(
        request: Request,
        state: Literal["waiting", "decided", "all"] = "waiting",
        site: Annotated[str | None, Query()] = None,
        sc: Annotated[str | None, Query()] = None,
        reason: Annotated[str | None, Query()] = None,
        limit: Annotated[int, Query(ge=1, le=500)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> ReviewOut:
        scs = set(sc.split(",")) if sc else None
        with request.app.state.sessions() as session:
            latest = [runs[0] for runs in _by_site(_finished_runs(session)).values()]
            latest.sort(key=lambda r: r.created_at, reverse=True)
            entries: list[tuple[Run, CaptureRow, FindingRow]] = []
            for run in latest:
                if site and site_of(run) != site:
                    continue
                for capture, row in _run_findings(session, run.id):
                    if row.tier != "needs-review":
                        continue
                    if state == "waiting" and row.status not in WAITING:
                        continue
                    if state == "decided" and row.status not in DECIDED:
                        continue
                    if scs and row.sc not in scs:
                        continue
                    entries.append((run, capture, row))
            counts = Counter(
                row.evidence.get("needs_review_reason") or None for _, _, row in entries
            )
            if reason:
                entries = [
                    e for e in entries if (e[2].evidence.get("needs_review_reason")) == reason
                ]
            page = entries[offset : offset + limit]
            return ReviewOut(
                items=[
                    ReviewItem(
                        finding=out(capture, row),
                        run_id=run.id,
                        source=run.source,
                        site=site_of(run),
                        viewport=capture.viewport,
                        created_at=_aware(run.created_at),
                    )
                    for run, capture, row in page
                ],
                counts_by_reason=[
                    ReasonCount(reason=k, count=v)
                    for k, v in sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))
                ],
                total=len(entries),
            )

    @router.get("/sites", response_model=list[SiteRow])
    def sites(request: Request) -> list[SiteRow]:
        with request.app.state.sessions() as session:
            all_runs = _by_site(
                list(
                    session.scalars(
                        select(Run)
                        .where(Run.id.not_in(select(StudyRun.run_id)))
                        .order_by(Run.created_at.desc())
                    )
                )
            )
            rows: list[SiteRow] = []
            for name, runs in all_runs.items():
                finished = [r for r in runs if r.status in FINISHED]
                latest = runs[0]
                summary = summarise_run(settings, latest)
                summary.created_at = _aware(summary.created_at)  # type: ignore[assignment]
                if latest.status in FINISHED:
                    found = [f for _, f in _run_findings(session, latest.id)]
                    failures = sum(1 for f in found if f.tier == "automated")
                    to_review = sum(
                        1 for f in found if f.tier == "needs-review" and f.status in WAITING
                    )
                    decided = _criteria_decided(session, latest)
                else:
                    failures = to_review = decided = 0
                before = next((r for r in finished if r.created_at < latest.created_at), None)
                if latest.status not in FINISHED:
                    before = finished[0] if finished else None
                delta: int | None = None
                if before is not None and latest.status in FINISHED:
                    delta = failures - sum(
                        1 for _, f in _run_findings(session, before.id) if f.tier == "automated"
                    )
                rows.append(
                    SiteRow(
                        site=name,
                        latest_run=summary,
                        previous_run_id=before.id if before else None,
                        failures=failures,
                        failures_delta=delta,
                        to_review=to_review,
                        criteria_decided=decided,
                    )
                )
            rows.sort(key=lambda r: r.latest_run.created_at, reverse=True)
            return rows

    @router.get("/summary/week", response_model=WeekSummary)
    def week(request: Request) -> WeekSummary:
        now = datetime.now(UTC)
        start = _week_start(now)
        last_start = start - timedelta(days=7)
        iou_min = protocol.load().thresholds.match.iou
        with request.app.state.sessions() as session:
            every = list(session.scalars(select(Run).where(Run.id.not_in(select(StudyRun.run_id)))))
            this_week = [r for r in every if _aware(r.created_at) >= start]  # type: ignore[operator]
            last_week = [
                r
                for r in every
                if last_start <= _aware(r.created_at) < start  # type: ignore[operator]
            ]
            grouped = _by_site(_finished_runs(session))
            verified = sum(
                len(delta_for(session, r, grouped, iou_min).fixes_verified)
                for r in this_week
                if r.status in FINISHED
            )
            decisions = [
                d
                for d in session.scalars(
                    select(FindingRow.decided_at).where(FindingRow.decided_at.is_not(None))
                )
                if _aware(d) >= start  # type: ignore[operator]
            ]
            latest = [runs[0] for runs in grouped.values()]
            counts = [_criteria_decided(session, r) for r in latest]
            fix_findings = 0
            fix_sites = 0
            for runs in grouped.values():
                waiting = [f for _, f in _run_findings(session, runs[0].id) if f.status == "fixed"]
                if waiting:
                    fix_findings += len(waiting)
                    fix_sites += 1
            running = [
                RunningAudit(
                    run_id=r.id, source=r.source, status=r.status, stage_status=r.stage_status
                )
                for r in sorted(every, key=lambda r: r.created_at, reverse=True)
                if r.status in {"queued", "running"}
            ]
            return WeekSummary(
                audits_this_week=len(this_week),
                audits_last_week=len(last_week),
                fixes_verified_this_week=verified,
                decisions_this_week=len(decisions),
                median_criteria_decided=float(statistics.median(counts)) if counts else 0.0,
                running=running,
                fixes_to_verify=FixesToVerify(findings=fix_findings, sites=fix_sites),
            )

    return router
