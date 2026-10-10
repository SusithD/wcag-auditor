from __future__ import annotations

import base64
import io
import re
from html import escape
from pathlib import Path
from typing import Any

from PIL import Image

from auditor.fusion.tiers import SEVERITY_ORDER

TIER_ORDER = {"automated": 0, "needs-review": 1, "not-assessable": 2}

OVERVIEW_WIDTH = 900
GLYPH = {"critical": "●", "serious": "▲", "minor": "■", "needs-review": "◇"}
LABEL = {
    "critical": "Critical",
    "serious": "Serious",
    "minor": "Minor",
    "needs-review": "Needs review",
}
STROKE = {"critical": "none", "serious": "6 3", "minor": "2 2", "needs-review": "none"}
VERDICT_TEXT = {
    "automated": ("●", "Automated verdict"),
    "needs-review": ("◇", "Needs review"),
    "not-assessable": ("—", "Not assessable"),
    "none": ("—", "No verdict"),
}
SC_TITLES = {
    "1.4.3": "Contrast (Minimum)",
    "1.4.11": "Non-text Contrast",
    "2.4.7": "Focus Visible",
    "2.4.11": "Focus Not Obscured (Minimum)",
    "2.4.12": "Focus Not Obscured (Enhanced)",
    "2.4.13": "Focus Appearance",
    "2.5.7": "Dragging Movements",
    "2.5.8": "Target Size (Minimum)",
}
TEMPLATE = Path(__file__).with_name("template.html")


def _data_uri(image: Image.Image, fmt: str) -> str:
    buf = io.BytesIO()
    image.save(buf, format=fmt, **({"quality": 72} if fmt == "JPEG" else {}))
    mime = "jpeg" if fmt == "JPEG" else "png"
    return f"data:image/{mime};base64,{base64.b64encode(buf.getvalue()).decode()}"


def _severity_chip(finding: dict[str, Any]) -> str:
    key = "needs-review" if finding["tier"] == "needs-review" else finding["severity"]
    return f'<span class="chip sev-{key}"><span aria-hidden="true">{GLYPH[key]}</span> {LABEL[key]}</span>'


def _overview(report: dict[str, Any], folder: Path, shot_path: Path) -> str:
    with Image.open(shot_path) as opened:
        shot = opened.convert("RGB")
    width, height = shot.size
    scale = min(1.0, OVERVIEW_WIDTH / width)
    thumb = shot.resize((max(1, round(width * scale)), max(1, round(height * scale))))
    boxes = []
    for f in report["findings"]:
        b = f.get("bbox")
        if not b or f.get("focus_index") is not None:
            continue
        key = "needs-review" if f["tier"] == "needs-review" else f["severity"]
        geometry = f'x="{b["x"]}" y="{b["y"]}" width="{b["w"]}" height="{b["h"]}"'
        boxes.append(
            f'<rect {geometry} class="halo"/>'
            f'<rect {geometry} class="box sev-{key}" stroke-dasharray="{STROKE[key]}"/>'
            f'<text x="{b["x"]}" y="{max(b["y"] - 4, 12)}" class="tag">{escape(f["id"])}</text>'
        )
    alt = (
        f"Full-page screenshot of {report['page']['url']}, {report['page']['viewport']} viewport, "
        f"{len(report['findings'])} findings. Each page-level finding is outlined and labelled with "
        f"its id; the findings list below describes every one."
    )
    return (
        f'<figure class="overview"><div class="shot"><img src="{_data_uri(thumb, "JPEG")}" '
        f'alt="{escape(alt)}" width="{thumb.width}" height="{thumb.height}">'
        f'<svg viewBox="0 0 {width} {height}" aria-hidden="true" focusable="false">{"".join(boxes)}</svg>'
        f"</div><figcaption>Boxes mark page-level findings; keyboard-focus findings are shown "
        f"with before and after crops.</figcaption></figure>"
    )


def _coverage_table(report: dict[str, Any]) -> str:
    cells: dict[str, dict[str, str]] = {}
    for c in report["coverage"]["cells"]:
        cells[c["sc"]] = c
    rows = []
    for sc, title in SC_TITLES.items():
        c = cells.get(sc)
        tds = ""
        for channel in ("rule", "pixel", "hybrid"):
            glyph, text = VERDICT_TEXT[c[f"{channel}_verdict"]] if c else VERDICT_TEXT["none"]
            tds += f'<td><span aria-hidden="true">{glyph}</span> {text}</td>'
        rows.append(
            f'<tr><th scope="row"><span class="mono">{sc}</span> {escape(title)}</th>{tds}</tr>'
        )
    rel = report["reliable"]
    foot = "".join(
        f"<td>{rel[ch]['automated']} of 8 automated; {rel[ch]['any']} of 8 with any verdict</td>"
        for ch in ("rule", "pixel", "hybrid")
    )
    return (
        '<table class="coverage"><caption>Which channel returned a verdict for each criterion'
        '</caption><thead><tr><th scope="col">Success criterion</th><th scope="col">Rule channel</th>'
        '<th scope="col">Pixel channel</th><th scope="col">Hybrid</th></tr></thead><tbody>'
        + "".join(rows)
        + f'</tbody><tfoot><tr><th scope="row">Criteria with a verdict</th>{foot}</tr></tfoot></table>'
    )


def _finding(report: dict[str, Any], f: dict[str, Any], folder: Path) -> str:
    fid = f["id"]
    g = report["guidance"].get(fid) or {}
    title = f"{f['sc']} {escape(g.get('sc_title', ''))}"
    crop = report["crops"].get(fid)
    img = ""
    if crop and (folder / crop).is_file():
        with Image.open(folder / crop) as image:
            uri = _data_uri(image.convert("RGB"), "PNG")
        rows_text = "; ".join(
            f"{label} {value}" for label, value in report["evidence_rows"].get(fid, [])[:2]
        )
        kind = (
            "the control without and with keyboard focus, side by side"
            if f.get("focus_index") is not None
            else "the flagged element"
        )
        alt = f"Finding {fid}, {f['sc']}: crop of {kind}" + (f". {rows_text}" if rows_text else "")
        img = (
            f'<img class="crop" src="{uri}" alt="{escape(alt)}" '
            f'width="{image.width}" height="{image.height}">'
        )
    rows = "".join(
        f"<div><dt>{escape(label)}</dt><dd>{escape(value)}</dd></div>"
        for label, value in report["evidence_rows"].get(fid, [])
    )
    techniques = "".join(
        f'<li><a href="{escape(t["url"])}">{escape(t["id"])}: {escape(t["title"])}</a></li>'
        for t in g.get("techniques", [])
    )
    where = (
        f"focus stop {f['focus_index']}"
        if f.get("focus_index") is not None
        else (
            f"x {f['bbox']['x']:.0f}, y {f['bbox']['y']:.0f}, {f['bbox']['w']:.0f} x {f['bbox']['h']:.0f} px"
            if f.get("bbox")
            else ""
        )
    )
    fix = ""
    if g:
        fix = (
            f"<h4>How to fix</h4><p>{escape(g['nearest_passing'])}</p>"
            f'<pre tabindex="0" role="region" aria-label="CSS fix for {fid}"><code>{escape(g["fix_css"])}</code></pre>'
            + (
                f'<pre tabindex="0" role="region" aria-label="HTML fix for {fid}"><code>{escape(g["fix_html"])}</code></pre>'
                if g["fix_html"]
                else ""
            )
            + f'<p><a href="{escape(g["understanding"])}">Understanding {f["sc"]} on w3.org</a></p>'
            f"<ul>{techniques}</ul>"
        )
    return (
        f'<article class="finding" id="{fid}" aria-labelledby="{fid}-h"><h3 id="{fid}-h">'
        f'<span class="mono">{escape(where)}</span> {title} <span class="mono">{fid}</span></h3>'
        f'<p class="meta">{_severity_chip(f)} <span class="chip">Provenance: {f["provenance"]}</span> '
        f'<span class="chip">Tier: {f["tier"]}</span> <span class="chip">Score {f["score"]:.2f}</span> '
        f"</p>"
        f'<p>{escape(g.get("what_failed", ""))}</p>{img}<dl class="evidence">{rows}</dl>{fix}</article>'
    )


def render(report: dict[str, Any], folder: Path, screenshot: Path) -> str:
    """A single self-contained HTML file (inline CSS, data-URI images, no scripts)."""
    page = report["page"]
    by_sc: dict[str, list[dict[str, Any]]] = {}
    for f in report["findings"]:
        by_sc.setdefault(f["sc"], []).append(f)
    sections = []
    nav = []
    for sc, title in SC_TITLES.items():
        items = by_sc.get(sc, [])
        if not items:
            continue
        nav.append(
            f'<li><a href="#sc-{sc}"><span class="mono">{sc}</span> {escape(title)} ({len(items)})</a></li>'
        )
        body = "".join(
            _finding(report, f, folder)
            for f in sorted(
                items, key=lambda x: (TIER_ORDER[x["tier"]], SEVERITY_ORDER[x["severity"]])
            )
        )
        sections.append(
            f'<section id="sc-{sc}" aria-labelledby="sc-{sc}-h"><h2 id="sc-{sc}-h">{sc} {escape(title)}</h2>{body}</section>'
        )
    s = report["summary"]
    summary = "".join(
        f'<li><span class="chip sev-{sev}"><span aria-hidden="true">{GLYPH[sev]}</span> {LABEL[sev]}</span> {s["by_severity"][sev]}</li>'
        for sev in SEVERITY_ORDER
    )
    empty = (
        "<p>No violations were reported for the criteria checked. The coverage table shows what "
        "was and was not assessed.</p>"
        if not report["findings"]
        else ""
    )
    values = {
        "title": escape(f"WCAG audit: {page['url']}"),
        "url": escape(str(page["url"])),
        "condition": escape(report["condition"].replace("_", "-")),
        "viewport": escape(page["viewport"]),
        "total": str(s["total"]),
        "summary": summary,
        "overview": _overview(report, folder, screenshot),
        "coverage": _coverage_table(report),
        "nav": "".join(nav) or "<li>No findings</li>",
        "empty": empty,
        "findings": "".join(sections),
        "versions": escape(
            ", ".join(
                f"{k}: {v}"
                for k, v in report["versions"].items()
                if v and k in {"chromium", "playwright", "protocol_sha"}
            )
        ),
    }
    template = TEMPLATE.read_text(encoding="utf-8")
    return re.sub(r"\$([a-z]+)\b", lambda m: values.get(m.group(1), m.group(0)), template)
