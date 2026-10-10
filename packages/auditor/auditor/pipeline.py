from __future__ import annotations

import json
import logging
import shutil
import uuid
from datetime import UTC, datetime
from pathlib import Path

from auditor import protocol, versions
from auditor.elements.dom import GeometryUnavailable
from auditor.elements.select import SourceSelector
from auditor.fusion import fuse
from auditor.fusion.coverage import Inputs, build_coverage
from auditor.report import build as report_build
from auditor.report.pdf import render_pdf
from auditor.report.render import render
from auditor.rules.axe import AxeRunner, dumps
from auditor.rules.rulemap import to_findings
from auditor.schema import Capture, Condition, Finding, Run

log = logging.getLogger(__name__)
OUTPUTS = ("report.json", "report.html", "report.pdf", "rule_findings.json", "VERSIONS.json")
PDF_TIMEOUT_S = 120


def pixel_channel(capture: Capture) -> tuple[list[Finding], Inputs]:
    """Run every module over the element source the capture allows (ADR-012)."""
    from auditor.modules import MODULES, ModuleContext

    selector = SourceSelector()
    try:
        name, source = selector.for_capture(capture)
        try:
            elements = source.elements(capture)
        except GeometryUnavailable:
            name, source = "pixel", selector.pixel
            elements = source.elements(capture)
        ctx = ModuleContext.load(capture, elements, has_geometry=name == "dom" and bool(elements))
        findings = [f for run in MODULES.values() for f in run(ctx)]
        inputs = Inputs(
            element_source=name,
            has_geometry=name == "dom" and bool(elements),
            has_detector=getattr(selector, "detector_loaded", False),
            has_text_style=name == "dom",
            focus_stops=len(ctx.focus),
        )
    finally:
        selector.close()
    return findings, inputs


def run_folder(folder: Path, out: Path, condition: Condition = "hybrid", pdf: bool = True) -> Run:
    """Replay a capture folder: rule channel, pixel channel (hybrid only), fusion, coverage and
    the report (report.json, report.html, report.pdf, crops/)."""
    capture = Capture.from_folder(folder)
    proto = protocol.load()
    out.mkdir(parents=True, exist_ok=True)
    for name in OUTPUTS:
        (out / name).unlink(missing_ok=True)
    shutil.rmtree(out / "crops", ignore_errors=True)
    with AxeRunner() as runner:
        raw = runner.run(capture)
    (out / "rule_findings.json").write_text(dumps(raw))
    rule_findings, boxless = to_findings(raw["findings"])
    stage = {"rules": "done", "rules_boxless_nodes": str(boxless)}
    pixel: list[Finding] = []
    inputs: Inputs | None = None
    if condition == "hybrid":
        pixel, inputs = pixel_channel(capture)
        stage.update(pixel="done", element_source=inputs.element_source)
    fused = fuse(rule_findings + [f for f in pixel if f.tier != "not-assessable"], proto)
    stage["fusion"] = "done"
    run_versions = versions.collect(capture.meta)
    run = Run(
        id=uuid.uuid4().hex,
        created_at=datetime.now(UTC),
        source_kind="folder",
        source=str(folder),
        viewports=[capture.viewport],
        condition=condition,
        status="done",
        stage_status=stage,
        versions=run_versions,
        protocol_sha=protocol.sha256(),
        findings=fused,
        coverage=build_coverage(capture, condition, inputs, rule_ran=True),
    )
    report = report_build.build(run, capture, out)
    html = render(report, out, capture.path / "screenshot.png")
    (out / "report.html").write_text(html, encoding="utf-8")
    (out / "VERSIONS.json").write_text(json.dumps(run_versions, indent=2))
    if pdf:
        try:
            render_pdf(out / "report.html", out / "report.pdf", timeout_s=PDF_TIMEOUT_S)
            run.stage_status["pdf"] = "done"
        except Exception as exc:
            log.warning("PDF export failed: %s", exc)
            run.stage_status["pdf"] = f"failed: {type(exc).__name__}"
        report["stage_status"] = run.stage_status
        (out / "report.json").write_text(json.dumps(report, indent=2))
    return run
