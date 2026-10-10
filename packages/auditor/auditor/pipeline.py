from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from auditor import protocol, versions
from auditor.rules.axe import AxeRunner, dumps
from auditor.rules.rulemap import COVERED_SCS, to_findings
from auditor.schema import Capture, Condition, Coverage, CoverageCell, Finding, Run


def run_folder(folder: Path, out: Path, condition: Condition = "hybrid") -> Run:
    capture = Capture.from_folder(folder)
    proto = protocol.load()
    findings: list[Finding] = []
    stage_status = {"stub": "done"}
    out.mkdir(parents=True, exist_ok=True)
    if condition == "rule_only":
        with AxeRunner() as runner:
            raw = runner.run(capture)
        (out / "rule_findings.json").write_text(dumps(raw))
        findings, boxless = to_findings(raw["findings"])
        stage_status = {"rules": "done", "rules_boxless_nodes": str(boxless)}
        coverage = Coverage(
            cells=[
                CoverageCell(
                    viewport=capture.viewport,
                    sc=sc,
                    rule_verdict="automated" if sc in COVERED_SCS else "none",
                    pixel_verdict="none",
                    hybrid_verdict="automated" if sc in COVERED_SCS else "none",
                )
                for sc in proto.scs
            ]
        )
    else:
        coverage = _stub_coverage(capture, proto.scs)
    return _finish(capture, folder, out, condition, findings, stage_status, coverage)


def _stub_coverage(capture: Capture, scs: list[str]) -> Coverage:
    return Coverage(
        cells=[
            CoverageCell(
                viewport=capture.viewport,
                sc=sc,
                rule_verdict="not-assessable",
                pixel_verdict="not-assessable",
                hybrid_verdict="not-assessable",
            )
            for sc in scs
        ]
    )


def _finish(
    capture: Capture,
    folder: Path,
    out: Path,
    condition: Condition,
    findings: list[Finding],
    stage_status: dict[str, str],
    coverage: Coverage,
) -> Run:
    run_versions = versions.collect(capture.meta)
    run = Run(
        id=uuid.uuid4().hex,
        created_at=datetime.now(UTC),
        source_kind="folder",
        source=str(folder),
        viewports=[capture.viewport],
        condition=condition,
        status="done",
        stage_status=stage_status,
        versions=run_versions,
        protocol_sha=protocol.sha256(),
        findings=findings,
        coverage=coverage,
    )
    (out / "report.json").write_text(run.model_dump_json(indent=2))
    (out / "VERSIONS.json").write_text(json.dumps(run_versions, indent=2))
    return run
