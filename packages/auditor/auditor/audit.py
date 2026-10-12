from __future__ import annotations

import json
import time
from collections.abc import Callable, Sequence
from pathlib import Path

from auditor.pipeline import atomic_write, run_folder
from auditor.schema import Condition

EVENTS = "events.jsonl"
SUMMARY = "summary.json"


class EventLog:
    def __init__(self, run_dir: Path) -> None:
        self.path = run_dir / EVENTS

    def emit(self, stage: str, viewport: str | None = None, detail: str | None = None) -> None:
        event = {"ts": time.time(), "stage": stage, "viewport": viewport, "detail": detail}
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(event) + "\n")


def _counts(report_path: Path) -> dict[str, int]:
    findings = json.loads(report_path.read_text())["findings"]
    out = {"critical": 0, "serious": 0, "minor": 0, "needs_review": 0}
    for f in findings:
        out["needs_review" if f["tier"] == "needs-review" else f["severity"]] += 1
    return out


def _criteria_counts(report_path: Path) -> dict[str, int]:
    findings = json.loads(report_path.read_text())["findings"]
    out: dict[str, int] = {}
    for f in findings:
        out[f["sc"]] = out.get(f["sc"], 0) + 1
    return dict(sorted(out.items()))


def _progress(log: EventLog, viewport: str) -> Callable[[str], None]:
    def emit(stage: str) -> None:
        log.emit(stage, viewport)

    return emit


def audit(
    run_dir: Path,
    *,
    url: str | None = None,
    folders: Sequence[Path] = (),
    viewports: Sequence[str] = ("desktop", "mobile"),
    condition: Condition = "hybrid",
    max_focus_steps: int = 15,
    pdf: bool = True,
    profile_dir: Path | None = None,
    verify_timeout_s: float = 0,
) -> int:
    """Capture (for a URL) or replay capture folders, then run the pipeline per viewport.
    Progress goes to run_dir/events.jsonl and the outcome to run_dir/summary.json."""
    run_dir.mkdir(parents=True, exist_ok=True)
    log = EventLog(run_dir)
    summary: dict[str, object] = {"viewports": {}, "errors": {}}
    viewport_summary: dict[str, dict[str, object]] = {}
    errors: dict[str, str] = {}
    summary["viewports"], summary["errors"] = viewport_summary, errors
    captured: dict[str, Path] = {}
    try:
        if url is not None:
            from auditor.capture import PlaywrightBrowser, capture_url

            current: list[str] = [""]

            def waiting(remaining: int) -> None:
                log.emit("waiting:verify", current[0], str(remaining))

            with PlaywrightBrowser(
                profile_dir=profile_dir, verify_timeout_s=verify_timeout_s, on_wait=waiting
            ) as browser:
                for vp in viewports:
                    current[0] = vp
                    log.emit(f"capture:{vp}", vp)
                    failures: list[str] = []
                    made = capture_url(
                        browser, url, run_dir / "captures", [vp], max_focus_steps, errors=failures
                    )
                    if made:
                        captured[vp] = made[0]
                        log.emit(f"captured:{vp}", vp, str(made[0]))
                    else:
                        errors[vp] = (
                            failures[0].removeprefix(f"{vp}: ") if failures else "capture failed"
                        )
                        log.emit(f"failed:capture:{vp}", vp, errors[vp])
        else:
            from auditor.schema import Capture

            for folder in folders:
                vp = Capture.from_folder(folder).viewport
                captured[vp] = folder
                log.emit(f"captured:{vp}", vp, str(folder))
        for vp, folder in captured.items():
            out = run_dir / vp
            try:
                run_folder(
                    folder,
                    out,
                    condition,
                    pdf=pdf,
                    progress=_progress(log, vp),
                )
                counts = _counts(out / "report.json")
                criteria = _criteria_counts(out / "report.json")
                viewport_summary[vp] = {"counts": counts, "criteria": criteria}
                log.emit(f"counts:{vp}", vp, json.dumps({**counts, "criteria": criteria}))
            except Exception as exc:
                errors[vp] = f"{type(exc).__name__}: {exc}"
                log.emit(f"failed:{vp}", vp, errors[vp])
    except Exception as exc:
        errors["run"] = f"{type(exc).__name__}: {exc}"
        log.emit("failed:run", None, errors["run"])
    status = (
        "done"
        if viewport_summary and not errors
        else "failed"
        if not viewport_summary
        else "partial"
    )
    summary["status"] = status
    atomic_write(run_dir / SUMMARY, json.dumps(summary, indent=2))
    log.emit("done" if viewport_summary else "failed:run")
    return 0 if viewport_summary else 1
