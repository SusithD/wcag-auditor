from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import CaptureRow, CoverageRow, FindingRow


def ingest_run(session: Session, run_id: str, run_dir: Path) -> None:
    """Copy each finished viewport's report.json into captures/findings/coverage (idempotent)."""
    kept: dict[tuple[str, str], str] = {}
    for capture, finding in session.execute(
        select(CaptureRow, FindingRow)
        .join(FindingRow, FindingRow.capture_id == CaptureRow.id)
        .where(CaptureRow.run_id == run_id)
    ):
        kept[(capture.viewport, finding.key or "")] = finding.status
    session.execute(delete(CaptureRow).where(CaptureRow.run_id == run_id))
    for report_path in sorted(run_dir.glob("*/report.json")):
        try:
            report = json.loads(report_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        viewport = report_path.parent.name
        capture = CaptureRow(
            run_id=run_id,
            viewport=viewport,
            path=str(report_path.parent),
            meta=report.get("page", {}),
            page_features={},
        )
        session.add(capture)
        session.flush()
        for f in report.get("findings", []):
            session.add(
                FindingRow(
                    capture_id=capture.id,
                    key=f["id"],
                    sc=f["sc"],
                    bbox=f.get("bbox"),
                    focus_index=f.get("focus_index"),
                    severity=f["severity"],
                    tier=f["tier"],
                    score=f["score"],
                    provenance=f["provenance"],
                    evidence=f.get("evidence", {}),
                    guidance_key=f["guidance_key"],
                    status=kept.get((viewport, f["id"]), "open"),
                )
            )
        for c in report.get("coverage", {}).get("cells", []):
            session.add(
                CoverageRow(
                    capture_id=capture.id,
                    sc=c["sc"],
                    rule_verdict=c["rule_verdict"],
                    pixel_verdict=c["pixel_verdict"],
                    hybrid_verdict=c["hybrid_verdict"],
                )
            )
    session.commit()


def capture_for(session: Session, run_id: str, viewport: str) -> CaptureRow | None:
    return session.scalars(
        select(CaptureRow).where(CaptureRow.run_id == run_id, CaptureRow.viewport == viewport)
    ).first()
