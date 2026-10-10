from __future__ import annotations

import json
import logging
import shutil
import uuid
from collections.abc import Callable
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
from auditor.schema import Capture, Condition, Coverage, CoverageCell, Finding, Run

log = logging.getLogger(__name__)
OUTPUTS = (
    "report.json",
    "report.html",
    "report.pdf",
    "rule_findings.json",
    "rule_only.json",
    "VERSIONS.json",
)
PDF_TIMEOUT_S = 120

MOBILE_MAX_WIDTH = 600


Progress = Callable[[str], None]


def _quiet(_stage: str) -> None:
    return None


def atomic_write(path: Path, text: str) -> None:
    tmp = path.with_name(f".{path.name}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_rule_only(
    out: Path, rule_findings: list[Finding], proto: protocol.Protocol, has_dom: bool
) -> None:
    """The rule-only view of the same capture, for the compare screen."""
    fused = fuse(rule_findings, proto)
    rows = {f.id or "": report_build.evidence_rows(f) for f in fused}
    payload = {
        "findings": [json.loads(f.model_dump_json()) for f in fused],
        "evidence_rows": rows,
        "has_dom": has_dom,
    }
    atomic_write(out / "rule_only.json", json.dumps(payload, indent=2))


def pixel_channel(capture: Capture, progress: Progress = _quiet) -> tuple[list[Finding], Inputs]:
    """Run every module over the element source the capture allows (ADR-012)."""
    from auditor.modules import MODULES, ModuleContext

    selector = SourceSelector()
    try:
        progress("elements")
        name, source = selector.for_capture(capture)
        try:
            elements = source.elements(capture)
        except GeometryUnavailable:
            name, source = "pixel", selector.pixel
            elements = source.elements(capture)
        ctx = ModuleContext.load(capture, elements, has_geometry=name == "dom" and bool(elements))
        findings: list[Finding] = []
        for sc, module in MODULES.items():
            progress(f"module:{sc}")
            findings += module(ctx)
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


def run_folder(
    folder: Path,
    out: Path,
    condition: Condition = "hybrid",
    pdf: bool = True,
    progress: Progress = _quiet,
) -> Run:
    """Replay a capture folder: rule channel, pixel channel (hybrid only), fusion, coverage and
    the report (report.json, report.html, report.pdf, crops/)."""
    capture = Capture.from_folder(folder)
    proto = protocol.load()
    out.mkdir(parents=True, exist_ok=True)
    for name in OUTPUTS:
        (out / name).unlink(missing_ok=True)
    shutil.rmtree(out / "crops", ignore_errors=True)
    has_dom = (capture.path / "dom.html").is_file()
    rule_findings: list[Finding] = []
    stage: dict[str, str] = {"rules": "skipped"}
    if has_dom:
        progress("rules")
        with AxeRunner() as runner:
            raw = runner.run(capture)
        (out / "rule_findings.json").write_text(dumps(raw))
        rule_findings, boxless = to_findings(raw["findings"])
        stage = {"rules": "done", "rules_boxless_nodes": str(boxless)}
    pixel: list[Finding] = []
    inputs: Inputs | None = None
    if condition == "hybrid":
        pixel, inputs = pixel_channel(capture, progress)
        stage.update(pixel="done", element_source=inputs.element_source)
    progress("fusion")
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
        coverage=build_coverage(capture, condition, inputs, rule_ran=has_dom),
    )
    progress("report")
    report = report_build.build(run, capture, out)
    html = render(report, out, capture.path / "screenshot.png")
    atomic_write(out / "report.html", html)
    if condition == "hybrid":
        write_rule_only(out, rule_findings, proto, has_dom)
    (out / "VERSIONS.json").write_text(json.dumps(run_versions, indent=2))
    if pdf:
        try:
            render_pdf(out / "report.html", out / "report.pdf", timeout_s=PDF_TIMEOUT_S)
            run.stage_status["pdf"] = "done"
        except Exception as exc:
            log.warning("PDF export failed: %s", exc)
            run.stage_status["pdf"] = f"failed: {type(exc).__name__}"
        report["stage_status"] = run.stage_status
        atomic_write(out / "report.json", json.dumps(report, indent=2))
    return run


SCREENSHOT_VERDICTS = {
    "1.4.3": "needs-review",
    "1.4.11": "needs-review",
    "2.5.8": "needs-review",
}


def _viewport_for(width: int) -> str:
    return "mobile" if width <= MOBILE_MAX_WIDTH else "desktop"


def run_screenshots(screenshots: list[Path], out: Path, condition: Condition = "hybrid") -> Run:
    """Screenshot-only mode (PLAN §1.1): no DOM, no focus pairs. Text lines come from OCR and
    controls from the detector when a model exists; findings that rest on detector boxes or on
    unknown text size are `needs-review`, and criteria with no input are `not-assessable`."""
    import shutil

    from PIL import Image

    from auditor.capture import VIEWPORTS
    from auditor.elements.detector import DetectorElementSource, model_path
    from auditor.elements.pixel import PixelElementSource
    from auditor.elements.select import CombinedPixelSource
    from auditor.modules import MODULES, ModuleContext

    proto = protocol.load()
    out.mkdir(parents=True, exist_ok=True)
    path = model_path()
    detector = DetectorElementSource(path) if path is not None else None
    source = CombinedPixelSource(PixelElementSource(), detector)
    findings: list[Finding] = []
    cells: list[CoverageCell] = []
    viewports: list[str] = []
    for i, shot in enumerate(screenshots):
        folder = out / f"capture_{i:02d}"
        folder.mkdir(exist_ok=True)
        shutil.copy(shot, folder / "screenshot.png")
        with Image.open(shot) as image:
            width = image.width
        viewport = _viewport_for(width)
        meta = {
            "origin": "upload",
            "viewport": viewport,
            "viewport_spec": {**VIEWPORTS[viewport], "device_scale_factor": 1},
            "focus_steps": [],
            "focus_step_count": 0,
            "url": str(shot),
        }
        (folder / "meta.json").write_text(json.dumps(meta, indent=1))
        capture = Capture.from_folder(folder)
        ctx = ModuleContext.load(capture, source.elements(capture), proto, load_focus=False)
        for run in MODULES.values():
            findings += [f for f in run(ctx) if f.tier != "not-assessable"]
        viewports.append(viewport)
        for sc in proto.scs:
            verdict = SCREENSHOT_VERDICTS.get(sc, "not-assessable")
            if sc != "1.4.3" and detector is None:
                verdict = "not-assessable"
            cells.append(
                CoverageCell(
                    viewport=viewport,
                    sc=sc,
                    rule_verdict="none",
                    pixel_verdict=verdict,
                    hybrid_verdict=verdict,
                )
            )
    run_versions = versions.collect()
    result = Run(
        id=uuid.uuid4().hex,
        created_at=datetime.now(UTC),
        source_kind="upload",
        source=",".join(str(p) for p in screenshots),
        viewports=sorted(set(viewports)),
        condition=condition,
        status="done",
        stage_status={"screenshot_only": "done", "detector": "loaded" if detector else "absent"},
        versions=run_versions,
        protocol_sha=protocol.sha256(),
        findings=findings,
        coverage=Coverage(cells=cells),
    )
    (out / "report.json").write_text(result.model_dump_json(indent=2))
    (out / "VERSIONS.json").write_text(json.dumps(run_versions, indent=2))
    return result
