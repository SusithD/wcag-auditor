from __future__ import annotations

import asyncio
import io
import json
import re
import shutil
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import Settings
from app.jobs import CANCELLED, TIMED_OUT, Job, JobResult, auditor_argv
from app.models import Run, StudyRun

Viewport = Literal["desktop", "mobile"]
Condition = Literal["hybrid", "rule_only"]
HEX = re.compile(r"^[0-9a-f]{32}$")
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
MAX_UPLOAD_PIXELS = 60_000_000
MOBILE_MAX_WIDTH = 600
TERMINAL = {"done", "failed", "cancelled", "partial"}
STAGE_FILES = {"report.json", "report.html", "report.pdf"}


def _both_viewports() -> list[Viewport]:
    return ["desktop", "mobile"]


class RunCreate(BaseModel):
    url: str | None = None
    upload_id: str | None = None
    folder: str | None = None
    viewports: list[Viewport] = Field(default_factory=_both_viewports, min_length=1)
    condition: Condition = "hybrid"
    max_focus_steps: int = Field(default=15, ge=5, le=30)


class RunCreated(BaseModel):
    run_id: str


class SeverityCounts(BaseModel):
    critical: int = 0
    serious: int = 0
    minor: int = 0
    needs_review: int = 0


class RunSummary(BaseModel):
    id: str
    created_at: datetime
    source_kind: Literal["url", "upload", "folder"]
    source: str
    viewports: list[Viewport]
    condition: Condition
    status: str
    stage_status: dict[str, Any]
    error: str | None
    counts: SeverityCounts
    available_viewports: list[Viewport]


class UploadResult(BaseModel):
    upload_id: str
    viewports: list[Viewport]


def normalise_url(raw: str) -> str:
    text = raw.strip()
    if not text:
        raise ValueError("Enter a web address")
    if "://" not in text:
        text = f"https://{text}"
    bad = ValueError("Enter a web address that starts with http:// or https://")
    parts = urlsplit(text)
    try:
        port = parts.port
    except ValueError:
        raise bad from None
    if parts.scheme not in {"http", "https"} or not parts.hostname or (port == 0):
        raise bad
    return text


def _folder_allowed(folder: Path, roots: tuple[Path, ...]) -> bool:
    resolved = folder.resolve()
    return any(resolved == root or root in resolved.parents for root in roots)


def _read_events(run_dir: Path) -> list[dict[str, Any]]:
    path = run_dir / "events.jsonl"
    if not path.is_file():
        return []
    out: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def _read_summary(run_dir: Path) -> dict[str, Any]:
    path = run_dir / "summary.json"
    if not path.is_file():
        return {}
    try:
        data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return data


def _capture_folders(run_dir: Path) -> dict[str, Path]:
    folders: dict[str, Path] = {}
    for ev in _read_events(run_dir):
        stage = str(ev.get("stage", ""))
        if stage.startswith("captured:") and ev.get("detail"):
            folders[stage.split(":", 1)[1]] = Path(ev["detail"])
    return folders


def build_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    def run_dir(run_id: str) -> Path:
        if not HEX.match(run_id):
            raise HTTPException(404, "Unknown run")
        return settings.runs_dir / run_id

    def summarise(row: Run) -> RunSummary:
        summary = _read_summary(settings.runs_dir / row.id)
        counts = SeverityCounts()
        available: list[Viewport] = []
        for vp, info in (summary.get("viewports") or {}).items():
            available.append(vp)
            for key, value in info.get("counts", {}).items():
                setattr(counts, key, getattr(counts, key) + int(value))
        return RunSummary(
            id=row.id,
            created_at=row.created_at,
            source_kind=row.source_kind,
            source=row.source,
            viewports=row.viewports,
            condition=row.condition,
            status=row.status,
            stage_status=row.stage_status,
            error=row.error,
            counts=counts,
            available_viewports=sorted(available),
        )

    def _store_upload(raw: bytes, name: str | None, base: Path, seen: list[Viewport]) -> Viewport:
        try:
            with Image.open(io.BytesIO(raw)) as image:
                width, height = image.size
                if width * height > MAX_UPLOAD_PIXELS:
                    raise HTTPException(413, f"{name} has too many pixels")
                image.load()
                rgb = image.convert("RGB")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(422, f"{name} is not an image") from exc
        vp: Viewport = "mobile" if width <= MOBILE_MAX_WIDTH else "desktop"
        if vp in seen:
            raise HTTPException(422, f"Two {vp} screenshots; upload one per viewport")
        folder = base / vp
        folder.mkdir(parents=True)
        rgb.save(folder / "screenshot.png")
        meta: dict[str, Any] = {
            "origin": "upload",
            "viewport": vp,
            "viewport_spec": {
                "width": width,
                "height": min(height, 900 if vp == "desktop" else 844),
                "is_mobile": vp == "mobile",
                "has_touch": vp == "mobile",
                "device_scale_factor": 1,
            },
            "url": name or "uploaded screenshot",
            "title": name,
            "capture_timestamp": datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ"),
            "screenshot_mode": "full_page",
            "focus_steps": [],
        }
        (folder / "meta.json").write_text(json.dumps(meta, indent=2))
        return vp

    @router.post("/uploads", response_model=UploadResult)
    async def create_upload(files: Annotated[list[UploadFile], File()]) -> UploadResult:
        if not files:
            raise HTTPException(422, "Choose at least one screenshot")
        upload_id = uuid.uuid4().hex
        base = settings.uploads_dir / upload_id
        seen: list[Viewport] = []
        try:
            for item in files:
                raw = await item.read(MAX_UPLOAD_BYTES + 1)
                if len(raw) > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, f"{item.filename} is larger than 25 MB")
                seen.append(await asyncio.to_thread(_store_upload, raw, item.filename, base, seen))
        except HTTPException:
            shutil.rmtree(base, ignore_errors=True)
            raise
        return UploadResult(upload_id=upload_id, viewports=sorted(seen))

    @router.post("/runs", response_model=RunCreated, status_code=201)
    async def create_run(body: RunCreate, request: Request) -> RunCreated:
        given = [x for x in (body.url, body.upload_id, body.folder) if x]
        if len(given) != 1:
            raise HTTPException(422, "Give exactly one of url, upload_id or folder")
        run_id = uuid.uuid4().hex
        out = settings.runs_dir / run_id
        argv = auditor_argv(
            "audit",
            "--out",
            str(out),
            "--condition",
            body.condition,
            "--max-focus-steps",
            str(body.max_focus_steps),
            "--pdf" if settings.pdf else "--no-pdf",
        )
        viewports = list(dict.fromkeys(body.viewports))
        if body.url:
            try:
                url = normalise_url(body.url)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
            kind, source = "url", url
            argv += ["--url", url, "--viewports", ",".join(viewports)]
        elif body.upload_id:
            if (
                not HEX.match(body.upload_id)
                or not (settings.uploads_dir / body.upload_id).is_dir()
            ):
                raise HTTPException(404, "Unknown upload")
            if body.condition == "rule_only":
                raise HTTPException(422, "Rule-only needs a page capture; screenshots have no DOM")
            kind, source = "upload", body.upload_id
            base = settings.uploads_dir / body.upload_id
            chosen = [vp for vp in viewports if (base / vp).is_dir()]
            if not chosen:
                raise HTTPException(422, "The upload has none of the selected viewports")
            viewports = chosen
            for vp in chosen:
                argv += ["--folder", str(base / vp)]
        else:
            folder = Path(body.folder or "")
            if (
                not _folder_allowed(folder, settings.folder_roots)
                or not (folder / "meta.json").is_file()
            ):
                raise HTTPException(422, "That folder is not an allowed capture folder")
            kind, source = "folder", str(folder.resolve())
            argv += ["--folder", source]
            try:
                viewports = [json.loads((folder / "meta.json").read_text())["viewport"]]
            except (KeyError, ValueError, OSError) as exc:
                raise HTTPException(422, "The capture folder has an unreadable meta.json") from exc
            if viewports[0] not in {"desktop", "mobile"}:
                raise HTTPException(422, "The capture folder has an unknown viewport")
        out.mkdir(parents=True)
        with request.app.state.sessions() as session:
            session.add(
                Run(
                    id=run_id,
                    source_kind=kind,
                    source=source,
                    viewports=viewports,
                    condition=body.condition,
                    status="queued",
                    stage_status={},
                )
            )
            session.commit()
        request.app.state.jobs.submit(Job(run_id, argv))
        return RunCreated(run_id=run_id)

    @router.get("/runs", response_model=list[RunSummary])
    def list_runs(
        request: Request, limit: Annotated[int, Query(ge=1, le=100)] = 20
    ) -> list[RunSummary]:
        with request.app.state.sessions() as session:
            hidden = select(StudyRun.run_id)
            rows = session.scalars(
                select(Run)
                .where(Run.id.not_in(hidden))
                .order_by(Run.created_at.desc())
                .limit(limit)
            )
            return [summarise(r) for r in rows]

    @router.get("/runs/{run_id}", response_model=RunSummary)
    def get_run(run_id: str, request: Request) -> RunSummary:
        run_dir(run_id)
        with request.app.state.sessions() as session:
            row = session.get(Run, run_id)
            if row is None:
                raise HTTPException(404, "Unknown run")
            return summarise(row)

    @router.post("/runs/{run_id}/cancel", status_code=202)
    def cancel_run(run_id: str, request: Request) -> dict[str, bool]:
        run_dir(run_id)
        with request.app.state.sessions() as session:
            if session.scalars(select(StudyRun).where(StudyRun.run_id == run_id)).first():
                raise HTTPException(403, "Study runs cannot be cancelled")
        cancelled: bool = request.app.state.jobs.cancel(run_id)
        if cancelled:
            with request.app.state.sessions() as session:
                row = session.get(Run, run_id)
                if row is not None and row.status == "queued":
                    row.status = "cancelled"
                    session.commit()
        return {"cancelled": cancelled}

    @router.get("/runs/{run_id}/events")
    async def run_events(run_id: str, request: Request) -> StreamingResponse:
        out = run_dir(run_id)
        with request.app.state.sessions() as session:
            if session.get(Run, run_id) is None:
                raise HTTPException(404, "Unknown run")

        async def stream() -> AsyncIterator[str]:
            sent = 0
            yield _sse({"stage": "queued", "viewport": None, "detail": None})
            while True:
                events = await asyncio.to_thread(_read_events, out)
                for ev in events[sent:]:
                    yield _sse(ev)
                sent = len(events)
                with request.app.state.sessions() as session:
                    row = session.get(Run, run_id)
                    status = row.status if row else "failed"
                if status in TERMINAL:
                    if sent == len(await asyncio.to_thread(_read_events, out)):
                        yield _sse({"stage": status, "viewport": None, "detail": None})
                        return
                    continue
                if await request.is_disconnected():
                    return
                yield ": keep-alive\n\n"
                await asyncio.sleep(0.5)

        return StreamingResponse(
            stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @router.get("/runs/{run_id}/assets/{viewport}/screenshot")
    def screenshot(run_id: str, viewport: Viewport) -> FileResponse:
        folder = _capture_folders(run_dir(run_id)).get(viewport)
        if folder is None or not (folder / "screenshot.png").is_file():
            raise HTTPException(404, "No screenshot yet")
        return FileResponse(folder / "screenshot.png", media_type="image/png")

    @router.get("/runs/{run_id}/report.{ext}")
    def report(
        run_id: str, ext: Literal["json", "html", "pdf"], viewport: Viewport
    ) -> FileResponse:
        path = run_dir(run_id) / viewport / f"report.{ext}"
        if path.name not in STAGE_FILES or not path.is_file():
            raise HTTPException(404, "Report not available")
        media = {"json": "application/json", "html": "text/html", "pdf": "application/pdf"}[ext]
        return FileResponse(path, media_type=media)

    return router


def _sse(payload: dict[str, Any]) -> str:
    return f"event: stage\ndata: {json.dumps(payload)}\n\n"


def status_from_result(result: JobResult, run_dir: Path) -> tuple[str, str | None]:
    if result.returncode == CANCELLED:
        return "cancelled", None
    if result.returncode == TIMED_OUT:
        return "failed", "The audit timed out"
    summary = _read_summary(run_dir)
    status = str(summary.get("status") or ("done" if result.returncode == 0 else "failed"))
    errors = summary.get("errors") or {}
    detail = "; ".join(f"{k}: {v}" for k, v in errors.items()) or None
    if status == "failed" and detail is None:
        detail = result.output[-500:] or "The audit failed"
    return status, detail
