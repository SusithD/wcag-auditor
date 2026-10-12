from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from auditor.fusion.tiers import SEVERITY_ORDER
from auditor.report import guidance
from auditor.schema import BBox, Capture, Finding, Run

CROP_PAD = 24
CROP_MAX_WIDTH = 640
HALO = (255, 255, 255)
STROKE = (24, 24, 27)


def _outline(draw: ImageDraw.ImageDraw, box: tuple[float, float, float, float]) -> None:
    x0, y0, x1, y1 = box
    draw.rectangle((x0 - 2, y0 - 2, x1 + 2, y1 + 2), outline=HALO, width=4)
    draw.rectangle((x0, y0, x1, y1), outline=STROKE, width=2)


def _fit(image: Image.Image) -> Image.Image:
    if image.width > CROP_MAX_WIDTH:
        ratio = CROP_MAX_WIDTH / image.width
        return image.resize(
            (CROP_MAX_WIDTH, max(1, round(image.height * ratio))), Image.Resampling.LANCZOS
        )
    scale = max(1, min(4, CROP_MAX_WIDTH // max(1, image.width) // 2))
    if scale > 1:
        return image.resize((image.width * scale, image.height * scale), Image.Resampling.NEAREST)
    return image


def page_crop(shot: Image.Image, box: BBox) -> Image.Image | None:
    x0, y0 = max(0, int(box.x) - CROP_PAD), max(0, int(box.y) - CROP_PAD)
    x1, y1 = (
        min(shot.width, int(box.x + box.w) + CROP_PAD),
        min(shot.height, int(box.y + box.h) + CROP_PAD),
    )
    if x1 <= x0 or y1 <= y0:
        return None
    crop = shot.crop((x0, y0, x1, y1)).convert("RGB")
    _outline(ImageDraw.Draw(crop), (box.x - x0, box.y - y0, box.x + box.w - x0, box.y + box.h - y0))
    return _fit(crop)


def focus_crop(capture: Capture, index: int) -> Image.Image | None:
    step = next((s for s in capture.focus_steps if s.index == index), None)
    if step is None:
        return None
    scale = step.png_scale or 1.0
    r = step.rect
    pair: list[Image.Image] = []
    for name in (step.file_off, step.file_on):
        path = capture.path / name
        if not path.is_file():
            return None
        with Image.open(path) as image:
            rgb = image.convert("RGB")
        box = (
            max(0, int((r.x - CROP_PAD) * scale)),
            max(0, int((r.y - CROP_PAD) * scale)),
            min(rgb.width, int((r.x + r.w + CROP_PAD) * scale)),
            min(rgb.height, int((r.y + r.h + CROP_PAD) * scale)),
        )
        if box[2] <= box[0] or box[3] <= box[1]:
            return None
        crop = rgb.crop(box)
        _outline(
            ImageDraw.Draw(crop),
            (
                r.x * scale - box[0],
                r.y * scale - box[1],
                (r.x + r.w) * scale - box[0],
                (r.y + r.h) * scale - box[1],
            ),
        )
        pair.append(crop)
    gap = 12
    sheet = Image.new(
        "RGB", (pair[0].width + gap + pair[1].width, max(c.height for c in pair)), (255, 255, 255)
    )
    sheet.paste(pair[0], (0, 0))
    sheet.paste(pair[1], (pair[0].width + gap, 0))
    return _fit(sheet)


def evidence_rows(f: Finding) -> list[tuple[str, str]]:
    """(label, value) rows for the evidence card: measured against required, then the rest.
    Values come from the pixel measurement, or from the axe failure summary for rule findings."""
    ev = f.evidence
    pixel: dict[str, Any] = ev["pixel"] if isinstance(ev.get("pixel"), dict) else {}
    rule: dict[str, Any] | None = ev["rule"] if isinstance(ev.get("rule"), dict) else None
    ctx = guidance.context(f)
    rows: list[tuple[str, str]] = []

    def add(label: str, value: object) -> None:
        if value is not None and value != "":
            rows.append((label, str(value)))

    if f.sc in {"1.4.3", "1.4.11"}:
        add("Measured contrast", f"{ctx['ratio']}:1" if ctx.get("ratio") is not None else None)
        add("Required contrast", f"{ctx['threshold']}:1" if ctx.get("threshold") else None)
        add("Foreground", ctx.get("fg") or ctx.get("border"))
        add("Background", ctx.get("bg") or ctx.get("outside"))
        add("Large text", pixel.get("large_text"))
    elif f.sc == "2.4.7":
        add("Strongest state change", f"{pixel.get('state_contrast_max')}:1")
        add("Required change", f"{pixel.get('threshold')}:1")
        add("Changed pixels", pixel.get("changed_px"))
    elif f.sc in {"2.4.11", "2.4.12"}:
        add("Covered share of the control", pixel.get("covered_fraction"))
        add("Method", pixel.get("method"))
    elif f.sc == "2.4.13":
        add("Strong changed area (CSS px)", pixel.get("strong_area_css"))
        add("Required area (CSS px)", pixel.get("required_area_css"))
        add("Rule", pixel.get("rule"))
    elif f.sc == "2.5.8":
        if ctx.get("w") is not None and ctx.get("h") is not None:
            add("Measured size", f"{ctx['w']} x {ctx['h']} px")
        threshold = pixel.get("threshold") or ctx["threshold"]
        add("Required size", f"{threshold} x {threshold} px")
    elif f.sc == "2.5.7":
        add("Alternatives found", pixel.get("alternatives_found"))
    if rule:
        add("axe rule", rule.get("rule"))
        add("axe impact", rule.get("impact"))
    return rows


def summary(findings: list[Finding]) -> dict[str, Any]:
    by_severity: Counter[str] = Counter(f.severity for f in findings)
    return {
        "total": len(findings),
        "by_severity": {s: by_severity.get(s, 0) for s in SEVERITY_ORDER},
        "by_sc": dict(Counter(f.sc for f in findings)),
        "by_provenance": dict(Counter(f.provenance for f in findings)),
        "by_tier": dict(Counter(f.tier for f in findings)),
    }


def reliable_counts(run: Run) -> dict[str, dict[str, int]]:
    """SCs with a verdict per channel: `automated` (decisive) and `any` (including needs-review)."""
    out: dict[str, dict[str, int]] = {}
    for channel in ("rule", "pixel", "hybrid"):
        automated: set[str] = set()
        anyverdict: set[str] = set()
        for c in run.coverage.cells:
            verdict = getattr(c, f"{channel}_verdict")
            if verdict == "automated":
                automated.add(c.sc)
            if verdict in {"automated", "needs-review"}:
                anyverdict.add(c.sc)
        out[channel] = {"automated": len(automated), "any": len(anyverdict)}
    return out


def build(run: Run, capture: Capture, out: Path) -> dict[str, Any]:
    """report.json: the Run plus page facts, summary, per-finding guidance, evidence rows and
    crop paths (relative to the output folder)."""
    crops_dir = out / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    Image.MAX_IMAGE_PIXELS = None
    with Image.open(capture.path / "screenshot.png") as opened:
        shot = opened.convert("RGB")
    crops: dict[str, str] = {}
    guid: dict[str, Any] = {}
    evid: dict[str, list[tuple[str, str]]] = {}
    for f in run.findings:
        fid = f.id or ""
        crop = focus_crop(capture, f.focus_index) if f.focus_index is not None else None
        if crop is None and f.bbox is not None:
            crop = page_crop(shot, f.bbox)
        if crop is not None:
            name = f"crops/{fid}.png"
            crop.save(out / name)
            crops[fid] = name
        guid[fid] = guidance.render(f)
        evid[fid] = evidence_rows(f)
    meta = capture.meta
    report: dict[str, Any] = json.loads(run.model_dump_json())
    report.update(
        page={
            "url": meta.get("final_url") or meta.get("url"),
            "title": meta.get("title"),
            "viewport": capture.viewport,
            "screenshot": {"width": shot.width, "height": shot.height},
            "capture_timestamp": meta.get("capture_timestamp"),
            "folder": capture.path.name,
        },
        summary=summary(run.findings),
        reliable=reliable_counts(run),
        guidance=guid,
        evidence_rows=evid,
        crops=crops,
    )
    tmp = out / ".report.json.tmp"
    tmp.write_text(json.dumps(report, indent=2))
    tmp.replace(out / "report.json")
    return report
