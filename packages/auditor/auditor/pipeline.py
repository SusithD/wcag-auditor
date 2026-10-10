from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from auditor import protocol, versions
from auditor.rules.axe import AxeRunner, dumps
from auditor.rules.rulemap import COVERED_SCS, to_findings
from auditor.schema import Capture, Condition, Coverage, CoverageCell, Finding, Run

MOBILE_MAX_WIDTH = 600


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
