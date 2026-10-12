from __future__ import annotations

import csv
import io
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api import HEX, Viewport, _capture_folders
from app.auth import current_user
from app.config import Settings
from app.ingest import capture_for, ingest_run
from app.models import CaptureRow, FindingRow

Status = Literal["open", "fixed", "dismissed", "confirmed", "unsure"]
Verdict = Literal["automated", "needs-review", "not-assessable", "none"]


class Technique(BaseModel):
    id: str
    title: str
    url: str


class GuidanceOut(BaseModel):
    sc_title: str
    level: str
    understanding: str
    what_failed: str
    nearest_passing: str
    fix_css: str
    fix_html: str
    techniques: list[Technique]


class EvidenceRow(BaseModel):
    label: str
    value: str


class BBoxOut(BaseModel):
    x: float
    y: float
    w: float
    h: float


class Decision(BaseModel):
    status: Status = "open"
    reason: str | None = None
    note: str | None = None
    decided_at: datetime | None = None
    decided_by: str | None = None


class FindingOut(BaseModel):
    id: int
    key: str
    viewport: Viewport
    sc: str
    bbox: BBoxOut | None
    focus_index: int | None
    severity: Literal["critical", "serious", "minor"]
    tier: Literal["automated", "needs-review", "not-assessable"]
    score: float
    provenance: Literal["rule", "pixel", "both"]
    element: str
    guidance: GuidanceOut | None
    evidence_rows: list[EvidenceRow]
    has_crop: bool
    status: Status
    decision: Decision = Field(default_factory=Decision)
    needs_review_reason: str | None = None


class CoverageCellOut(BaseModel):
    sc: str
    rule_verdict: Verdict
    pixel_verdict: Verdict
    hybrid_verdict: Verdict


class Overview(BaseModel):
    viewport: Viewport
    url: str
    title: str | None
    screenshot_width: int
    screenshot_height: int
    focus_stops: int
    condition: str
    coverage: list[CoverageCellOut]
    available_viewports: list[Viewport]


class ExportInfo(BaseModel):
    format: Literal["json", "html", "pdf", "csv"]
    url: str
    size_bytes: int
    pages: int | None


class ComparePair(BaseModel):
    hybrid: str
    rule_only: str


class CompareOut(BaseModel):
    hybrid: list[FindingOut]
    rule_only: list[FindingOut]
    pairs: list[ComparePair]
    only_hybrid: list[str]
    only_rule_only: list[str]


class FindingPatch(BaseModel):
    status: Status
    reason: str | None = None
    note: str | None = None


def related(a: FindingOut, b: FindingOut, iou_min: float, containment_min: float) -> bool:
    """Same criterion and the same place: focus findings by stop, page findings by overlap."""
    if a.sc != b.sc:
        return False
    if a.focus_index is not None or b.focus_index is not None:
        return a.focus_index == b.focus_index
    if a.bbox is None or b.bbox is None:
        return False
    from auditor.geometry import containment, iou
    from auditor.schema import BBox

    box_a, box_b = BBox(**a.bbox.model_dump()), BBox(**b.bbox.model_dump())
    return (
        iou(box_a, box_b) >= iou_min
        or containment(box_a, box_b) >= containment_min
        or containment(box_b, box_a) >= containment_min
    )


def _csv_cell(value: object) -> object:
    text = str(value)
    return "'" + text if text[:1] in {"=", "+", "-", "@", "\t", "\r"} else value


def _element(evidence: dict[str, Any]) -> str:
    rule = evidence.get("rule")
    if isinstance(rule, dict) and rule.get("target"):
        return " ".join(str(t) for t in rule["target"])
    pixel = evidence.get("pixel")
    if isinstance(pixel, dict):
        for key in ("selector", "text", "name"):
            if pixel.get(key):
                return str(pixel[key])
    return "Page region"


def _load_report(run_dir: Path, viewport: str) -> dict[str, Any]:
    path = run_dir / viewport / "report.json"
    if not path.is_file():
        raise HTTPException(404, "Report not available")
    try:
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise HTTPException(500, "The report file is unreadable") from exc
    return data


def load_report_lenient(run_dir: Path, viewport: str) -> dict[str, Any]:
    path = run_dir / viewport / "report.json"
    try:
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data


def finding_out(row: FindingRow, viewport: str, report: dict[str, Any]) -> FindingOut:
    key = row.key or ""
    guidance = report.get("guidance", {}).get(key)
    rows = report.get("evidence_rows", {}).get(key, [])
    reason = row.evidence.get("needs_review_reason")
    return FindingOut(
        id=row.id,
        key=key,
        viewport=viewport,
        sc=row.sc,
        bbox=BBoxOut(**row.bbox) if row.bbox else None,
        focus_index=row.focus_index,
        severity=row.severity,
        tier=row.tier,
        score=row.score,
        provenance=row.provenance,
        element=_element(row.evidence),
        guidance=GuidanceOut(**guidance) if guidance else None,
        evidence_rows=[EvidenceRow(label=a, value=b) for a, b in rows],
        has_crop=key in report.get("crops", {}),
        status=row.status,
        decision=Decision(
            status=row.status,
            reason=row.decision_reason,
            note=row.decision_note,
            decided_at=_aware(row.decided_at),
            decided_by=row.decided_by,
        ),
        needs_review_reason=str(reason) if reason else None,
    )


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def build_report_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    def run_dir(run_id: str) -> Path:
        if not HEX.match(run_id):
            raise HTTPException(404, "Unknown run")
        return settings.runs_dir / run_id

    def ensure_ingested(session: Session, run_id: str, viewport: str) -> CaptureRow | None:
        capture = capture_for(session, run_id, viewport)
        if capture is None and (run_dir(run_id) / viewport / "report.json").is_file():
            try:
                ingest_run(session, run_id, run_dir(run_id))
            except Exception as exc:
                session.rollback()
                raise HTTPException(500, "The report could not be loaded") from exc
            capture = capture_for(session, run_id, viewport)
        return capture

    def to_out(row: FindingRow, viewport: str, report: dict[str, Any]) -> FindingOut:
        return finding_out(row, viewport, report)

    @router.get("/runs/{run_id}/overview", response_model=Overview)
    def overview(run_id: str, viewport: Viewport) -> Overview:
        report = _load_report(run_dir(run_id), viewport)
        page = report["page"]
        available = sorted(p.parent.name for p in run_dir(run_id).glob("*/report.json"))
        return Overview(
            viewport=viewport,
            url=str(page.get("url") or page.get("folder") or ""),
            title=page.get("title"),
            screenshot_width=page["screenshot"]["width"],
            screenshot_height=page["screenshot"]["height"],
            focus_stops=len(_focus_files(run_id, viewport)),
            condition=report["condition"],
            coverage=[CoverageCellOut(**c) for c in report["coverage"]["cells"]],
            available_viewports=available,
        )

    def _focus_files(run_id: str, viewport: str) -> list[Path]:
        folder = _capture_folders(run_dir(run_id)).get(viewport)
        return sorted(folder.glob("focus-*-off.png")) if folder else []

    def _csv(run_id: str, viewport: str, request: Request) -> str:
        report = _load_report(run_dir(run_id), viewport)
        with request.app.state.sessions() as session:
            capture = ensure_ingested(session, run_id, viewport)
            rows = (
                session.scalars(
                    select(FindingRow)
                    .where(FindingRow.capture_id == capture.id)
                    .order_by(FindingRow.key)
                ).all()
                if capture
                else []
            )
            out = io.StringIO()
            writer = csv.writer(out)
            writer.writerow(
                [
                    "id",
                    "sc",
                    "severity",
                    "tier",
                    "provenance",
                    "score",
                    "element",
                    "measured",
                    "required",
                    "status",
                    "x",
                    "y",
                    "w",
                    "h",
                ]
            )
            for r in rows:
                f = to_out(r, viewport, report)
                ev = f.evidence_rows
                box = f.bbox
                writer.writerow(
                    _csv_cell(c)
                    for c in [
                        f.key,
                        f.sc,
                        f.severity,
                        f.tier,
                        f.provenance,
                        f"{f.score:.2f}",
                        f.element,
                        ev[0].value if ev else "",
                        ev[1].value if len(ev) > 1 else "",
                        f.status,
                        box.x if box else "",
                        box.y if box else "",
                        box.w if box else "",
                        box.h if box else "",
                    ]
                )
            return out.getvalue()

    @router.get("/runs/{run_id}/report.csv")
    def report_csv(run_id: str, viewport: Viewport, request: Request) -> Response:
        return Response(
            _csv(run_id, viewport, request),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="findings-{viewport}.csv"'},
        )

    @router.get("/runs/{run_id}/exports", response_model=list[ExportInfo])
    def exports(run_id: str, viewport: Viewport, request: Request) -> list[ExportInfo]:
        base = run_dir(run_id) / viewport
        out: list[ExportInfo] = []
        for ext in ("json", "html", "pdf"):
            path = base / f"report.{ext}"
            if not path.is_file():
                continue
            pages = None
            if ext == "pdf":
                from pypdf import PdfReader

                pages = len(PdfReader(path).pages)
            out.append(
                ExportInfo(
                    format=ext,
                    url=f"/runs/{run_id}/report.{ext}?viewport={viewport}",
                    size_bytes=path.stat().st_size,
                    pages=pages,
                )
            )
        if out:
            text = _csv(run_id, viewport, request)
            out.append(
                ExportInfo(
                    format="csv",
                    url=f"/runs/{run_id}/report.csv?viewport={viewport}",
                    size_bytes=len(text.encode()),
                    pages=None,
                )
            )
        return out

    @router.get("/runs/{run_id}/findings", response_model=list[FindingOut])
    def list_findings(
        run_id: str,
        request: Request,
        viewport: Viewport,
        sc: Annotated[str | None, Query()] = None,
        severity: Annotated[str | None, Query()] = None,
        provenance: Annotated[str | None, Query()] = None,
        tier: Annotated[str | None, Query()] = None,
    ) -> list[FindingOut]:
        report = _load_report(run_dir(run_id), viewport)
        with request.app.state.sessions() as session:
            capture = ensure_ingested(session, run_id, viewport)
            if capture is None:
                raise HTTPException(404, "Run not ingested yet")
            query = select(FindingRow).where(FindingRow.capture_id == capture.id)
            for column, value in (
                (FindingRow.sc, sc),
                (FindingRow.severity, severity),
                (FindingRow.provenance, provenance),
                (FindingRow.tier, tier),
            ):
                if value:
                    query = query.where(column.in_(value.split(",")))
            rows = session.scalars(query.order_by(FindingRow.key)).all()
            return [to_out(r, viewport, report) for r in rows]

    @router.get("/runs/{run_id}/compare", response_model=CompareOut)
    def compare(run_id: str, viewport: Viewport, request: Request) -> CompareOut:
        from auditor import protocol

        base = run_dir(run_id) / viewport
        report = _load_report(run_dir(run_id), viewport)
        path = base / "rule_only.json"
        if not path.is_file():
            raise HTTPException(
                404, "Compare needs a hybrid run made with this version; run the audit again"
            )
        try:
            rule = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise HTTPException(500, "The rule-only file is unreadable") from exc
        with request.app.state.sessions() as session:
            capture = ensure_ingested(session, run_id, viewport)
            if capture is None:
                raise HTTPException(404, "Run not ingested yet")
            hybrid = [
                to_out(r, viewport, report)
                for r in session.scalars(
                    select(FindingRow)
                    .where(FindingRow.capture_id == capture.id)
                    .order_by(FindingRow.key)
                )
            ]
        rule_out: list[FindingOut] = []
        for f in rule["findings"]:
            key = f["id"]
            rows = rule.get("evidence_rows", {}).get(key, [])
            rule_out.append(
                FindingOut(
                    id=0,
                    key=key,
                    viewport=viewport,
                    sc=f["sc"],
                    bbox=BBoxOut(**f["bbox"]) if f.get("bbox") else None,
                    focus_index=f.get("focus_index"),
                    severity=f["severity"],
                    tier=f["tier"],
                    score=f["score"],
                    provenance=f["provenance"],
                    element=_element(f.get("evidence", {})),
                    guidance=None,
                    evidence_rows=[EvidenceRow(label=a, value=b) for a, b in rows],
                    has_crop=False,
                    status="open",
                )
            )
        m = protocol.load().thresholds.match
        pairs = [
            ComparePair(hybrid=h.key, rule_only=r.key)
            for h in hybrid
            for r in rule_out
            if related(h, r, m.iou, m.containment)
        ]
        matched_h = {p.hybrid for p in pairs}
        matched_r = {p.rule_only for p in pairs}
        return CompareOut(
            hybrid=hybrid,
            rule_only=rule_out,
            pairs=pairs,
            only_hybrid=[h.key for h in hybrid if h.key not in matched_h],
            only_rule_only=[r.key for r in rule_out if r.key not in matched_r],
        )

    @router.patch("/findings/{finding_id}", response_model=FindingOut)
    def patch_finding(finding_id: int, body: FindingPatch, request: Request) -> FindingOut:
        with request.app.state.sessions() as session:
            row = session.get(FindingRow, finding_id)
            if row is None:
                raise HTTPException(404, "Unknown finding")
            capture = session.get(CaptureRow, row.capture_id)
            assert capture is not None
            report = _load_report(Path(capture.path).parent, capture.viewport)
            reason = (body.reason or "").strip()
            if body.status == "dismissed" and not reason:
                raise HTTPException(422, "Give a reason for dismissing a finding")
            row.status = body.status
            if body.status == "open":
                row.decision_reason = row.decision_note = None
                row.decided_at = row.decided_by = None
            else:
                row.decision_reason = reason or None
                row.decision_note = (body.note or "").strip() or None
                row.decided_at = datetime.now(UTC)
                user = current_user(request)
                row.decided_by = user.display_name if user else settings.decided_by_name
            session.commit()
            return to_out(row, capture.viewport, report)

    @router.get("/runs/{run_id}/assets/{viewport}/crop/{key}")
    def crop(run_id: str, viewport: Viewport, key: str) -> FileResponse:
        if not key.startswith("f") or not key[1:].isdigit():
            raise HTTPException(404, "Unknown crop")
        path = run_dir(run_id) / viewport / "crops" / f"{key}.png"
        if not path.is_file():
            raise HTTPException(404, "Unknown crop")
        return FileResponse(path, media_type="image/png")

    @router.get("/runs/{run_id}/assets/{viewport}/focus/{index}/{state}")
    def focus_image(
        run_id: str, viewport: Viewport, index: int, state: Literal["on", "off"]
    ) -> FileResponse:
        folder = _capture_folders(run_dir(run_id)).get(viewport)
        name = f"focus-{index:03d}{'-off' if state == 'off' else ''}.png"
        if folder is None or index < 0 or not (folder / name).is_file():
            raise HTTPException(404, "Unknown focus image")
        return FileResponse(folder / name, media_type="image/png")

    return router
