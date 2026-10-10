from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from auditor import protocol, versions
from auditor.schema import Capture, Condition, Coverage, CoverageCell, Run


def run_folder(folder: Path, out: Path, condition: Condition = "hybrid") -> Run:
    capture = Capture.from_folder(folder)
    proto = protocol.load()
    coverage = Coverage(
        cells=[
            CoverageCell(
                viewport=capture.viewport,
                sc=sc,
                rule_verdict="not-assessable",
                pixel_verdict="not-assessable",
                hybrid_verdict="not-assessable",
            )
            for sc in proto.scs
        ]
    )
    run_versions = versions.collect(capture.meta)
    run = Run(
        id=uuid.uuid4().hex,
        created_at=datetime.now(UTC),
        source_kind="folder",
        source=str(folder),
        viewports=[capture.viewport],
        condition=condition,
        status="done",
        stage_status={"stub": "done"},
        versions=run_versions,
        protocol_sha=protocol.sha256(),
        coverage=coverage,
    )
    out.mkdir(parents=True, exist_ok=True)
    (out / "report.json").write_text(run.model_dump_json(indent=2))
    (out / "VERSIONS.json").write_text(json.dumps(run_versions, indent=2))
    return run
