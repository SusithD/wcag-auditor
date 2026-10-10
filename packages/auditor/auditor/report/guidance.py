from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

from auditor.modules.color import RGB, contrast_ratio, hex_of
from auditor.schema import Finding

GUIDANCE_PATH = Path(__file__).with_name("guidance.yaml")
_HEX = re.compile(r"^#?([0-9a-fA-F]{6})$")
_PLACEHOLDER = re.compile(r"\{([A-Za-z_][A-Za-z0-9_]*)\}")


@lru_cache(maxsize=1)
def load() -> dict[str, dict[str, Any]]:
    data: dict[str, dict[str, Any]] = yaml.safe_load(GUIDANCE_PATH.read_text(encoding="utf-8"))
    return data


def parse_hex(value: str) -> RGB | None:
    m = _HEX.match(value.strip())
    if not m:
        return None
    h = m.group(1)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def nearest_passing(fg: str, other: str, threshold: float) -> str | None:
    """The colour on the line from `fg` towards black or white (whichever raises contrast against
    `other`) that first reaches `threshold`; None if even the extreme does not."""
    a, b = parse_hex(fg), parse_hex(other)
    if a is None or b is None:
        return None
    if contrast_ratio(a, b) >= threshold:
        return hex_of(a)
    target: RGB = (
        (0, 0, 0)
        if contrast_ratio((0, 0, 0), b) >= contrast_ratio((255, 255, 255), b)
        else (255, 255, 255)
    )
    if contrast_ratio(target, b) < threshold:
        return None
    low, high = 0.0, 1.0
    for _ in range(24):
        mid = (low + high) / 2
        mixed = tuple(round(a[i] + (target[i] - a[i]) * mid) for i in range(3))
        if contrast_ratio(mixed, b) >= threshold:  # type: ignore[arg-type]
            high = mid
        else:
            low = mid
    final = tuple(round(a[i] + (target[i] - a[i]) * high) for i in range(3))
    return hex_of(final)  # type: ignore[arg-type]


_AXE_RATIO = re.compile(r"contrast of ([\d.]+)")
_AXE_FG = re.compile(r"foreground color: (#[0-9a-fA-F]{6})")
_AXE_BG = re.compile(r"background color: (#[0-9a-fA-F]{6})")
_AXE_EXPECTED = re.compile(r"Expected contrast ratio of ([\d.]+):1")
_AXE_SIZE = re.compile(r"size \(([\d.]+)px by ([\d.]+)px")


def axe_facts(summary: str) -> dict[str, Any]:
    """Measured values from an axe failure summary (colour contrast and target size)."""
    facts: dict[str, Any] = {}
    for key, pattern in (
        ("ratio", _AXE_RATIO),
        ("fg", _AXE_FG),
        ("bg", _AXE_BG),
        ("threshold", _AXE_EXPECTED),
    ):
        m = pattern.search(summary)
        if m:
            facts[key] = float(m.group(1)) if key in {"ratio", "threshold"} else m.group(1)
    size = _AXE_SIZE.search(summary)
    if size:
        facts.update(w=float(size.group(1)), h=float(size.group(2)))
    return facts


def context(f: Finding) -> dict[str, Any]:
    """Placeholder values for a finding (public: the evidence card uses them too)."""
    return _context(f)


def _context(f: Finding) -> dict[str, Any]:
    """Placeholder values for a finding: pixel evidence first, then the rule evidence."""
    ev = f.evidence
    ctx: dict[str, Any] = {}
    for part in (ev.get("rule"), ev.get("pixel"), ev):
        if isinstance(part, dict):
            ctx.update({k: v for k, v in part.items() if not isinstance(v, dict | list)})
    size = (
        (ev.get("pixel") or ev).get("size_px") if isinstance(ev.get("pixel") or ev, dict) else None
    )
    if isinstance(size, dict):
        ctx.update(w=size.get("w"), h=size.get("h"))
    rule_ev = ev.get("rule")
    if isinstance(rule_ev, dict) and isinstance(rule_ev.get("summary"), str):
        for key, value in axe_facts(rule_ev["summary"]).items():
            ctx.setdefault(key, value)
    ctx.setdefault("ring_min_px", 2)
    if f.bbox is not None:
        ctx.setdefault("w", f.bbox.w)
        ctx.setdefault("h", f.bbox.h)
    for key in ("w", "h"):
        if isinstance(ctx.get(key), float) and float(ctx[key]).is_integer():
            ctx[key] = int(ctx[key])
    return ctx


def render(f: Finding) -> dict[str, Any]:
    """Guidance for one finding with the evidence filled in (missing values stay as '?')."""
    entry = load().get(f.guidance_key)
    if entry is None:
        return {}
    ctx = _context(f)
    fg = str(ctx.get("fg", ""))
    bg = str(ctx.get("bg", ""))
    if f.sc == "1.4.3" and fg and bg:
        ctx["nearest"] = (
            nearest_passing(fg, bg, float(ctx.get("threshold", 0))) or "a darker colour"
        )
    if f.sc == "1.4.11":
        border, outside = str(ctx.get("border", "")), str(ctx.get("outside", ""))
        if border and outside:
            ctx["nearest"] = (
                nearest_passing(border, outside, float(ctx.get("threshold", 0)))
                or "a darker colour"
            )

    def fill(text: str) -> str:
        return _PLACEHOLDER.sub(lambda m: str(ctx.get(m.group(1), "?")), text) if text else text

    return {
        "sc_title": entry["sc_title"],
        "level": entry["level"],
        "understanding": entry["understanding"],
        "what_failed": fill(" ".join(str(entry["what_failed"]).split())),
        "nearest_passing": fill(" ".join(str(entry["nearest_passing"]).split())),
        "fix_css": fill(entry["fix_css"]),
        "fix_html": fill(entry["fix_html"] or ""),
        "techniques": entry["techniques"],
    }
