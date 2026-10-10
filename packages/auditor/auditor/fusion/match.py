from __future__ import annotations

from typing import Any

from auditor import protocol as protocol_mod
from auditor.fusion.tiers import best_tier, worst_severity
from auditor.geometry import containment, iou
from auditor.schema import BBox, Finding, Provenance


def _related(a: BBox, b: BBox, iou_threshold: float, containment_threshold: float) -> bool:
    return (
        iou(a, b) >= iou_threshold
        or containment(a, b) >= containment_threshold
        or containment(b, a) >= containment_threshold
    )


def _same_element(a: BBox, b: BBox, containment_threshold: float) -> bool:
    """Same-channel duplicates: each box lies mostly inside the other. A child element inside a
    larger parent is not a duplicate, so nested elements stay separate findings."""
    return containment(a, b) >= containment_threshold and containment(b, a) >= containment_threshold


def _dedupe(findings: list[Finding], containment_threshold: float) -> list[list[Finding]]:
    groups: list[list[Finding]] = []
    for f in sorted(findings, key=lambda x: -(x.bbox.w * x.bbox.h if x.bbox else 0)):
        for g in groups:
            if f.bbox and g[0].bbox and _same_element(f.bbox, g[0].bbox, containment_threshold):
                g.append(f)
                break
        else:
            groups.append([f])
    return groups


def _owner(pixel: Finding, rules: list[list[Finding]], iou_t: float, cont_t: float) -> int | None:
    """The rule element a pixel finding belongs to: the one it overlaps most by IoU (ties go to
    the smaller box), which for text lines inside nested elements is the innermost element."""
    best: tuple[float, float, int] | None = None
    for i, group in enumerate(rules):
        box = group[0].bbox
        if pixel.bbox is None or box is None or not _related(pixel.bbox, box, iou_t, cont_t):
            continue
        key = (iou(pixel.bbox, box), -box.w * box.h, i)
        if best is None or key[:2] > best[:2]:
            best = key
    return None if best is None else best[2]


def _area(f: Finding) -> float:
    return f.bbox.w * f.bbox.h if f.bbox else 0.0


def _union(boxes: list[BBox]) -> BBox:
    x0 = min(b.x for b in boxes)
    y0 = min(b.y for b in boxes)
    x1 = max(b.x + b.w for b in boxes)
    y1 = max(b.y + b.h for b in boxes)
    return BBox(x=x0, y=y0, w=x1 - x0, h=y1 - y0)


def _merge(members: list[Finding]) -> Finding:
    rule = [m for m in members if m.provenance in {"rule", "both"}]
    pixel = [m for m in members if m.provenance in {"pixel", "both"}]
    kind: Provenance = "both" if rule and pixel else ("rule" if rule else "pixel")
    primary = max(rule or members, key=_area)
    boxes = [m.bbox for m in members if m.bbox]
    bbox = primary.bbox if rule and primary.bbox else (_union(boxes) if boxes else None)
    evidence: dict[str, Any] = {"members": {"rule": len(rule), "pixel": len(pixel)}}
    if rule:
        evidence["rule"] = max(rule, key=_area).evidence
    if pixel:
        evidence["pixel"] = max(pixel, key=lambda m: m.score).evidence
    measured = pixel or rule
    best = max(members, key=lambda m: m.score)
    return Finding(
        sc=members[0].sc,
        bbox=bbox,
        focus_index=members[0].focus_index,
        severity=worst_severity(m.severity for m in measured),
        tier=best_tier(m.tier for m in members),
        score=best.score,
        provenance=kind,
        evidence=evidence,
        guidance_key=(pixel[0] if pixel else members[0]).guidance_key,
    )


def fuse(findings: list[Finding], protocol: protocol_mod.Protocol | None = None) -> list[Finding]:
    """One finding per element (PLAN §1.4). A rule finding is an element; pixel findings that
    overlap it (IoU or containment, ADR-013 thresholds) join it, so provenance becomes `both`.
    Same-channel duplicates (each box mostly inside the other) merge; nested elements do not.
    Focus findings are one element per (criterion, focus stop). Severity comes from the pixel
    members when there are any (their measurement follows Protocol amendment C; axe impacts are
    coarser), otherwise from the rule members; the tier is the most decisive member tier."""
    proto = protocol or protocol_mod.load()
    match = proto.thresholds.match
    out: list[Finding] = []
    by_key: dict[tuple[str, int | None], list[Finding]] = {}
    for f in findings:
        by_key.setdefault((f.sc, f.focus_index if f.focus_index is not None else -1), []).append(f)
    page: dict[str, list[Finding]] = {}
    for (sc, key), group in by_key.items():
        if key != -1:
            out.append(_merge(group))
        else:
            page.setdefault(sc, []).extend(group)
    for group in page.values():
        located = [f for f in group if f.bbox is not None]
        out += [_merge([f]) for f in group if f.bbox is None]
        rules = _dedupe([f for f in located if f.provenance != "pixel"], match.containment)
        pixels = _dedupe([f for f in located if f.provenance == "pixel"], match.containment)
        attached: dict[int, list[Finding]] = {i: [] for i in range(len(rules))}
        for pgroup in pixels:
            owner = _owner(pgroup[0], rules, match.iou, match.containment)
            if owner is None:
                out.append(_merge(pgroup))
            else:
                attached[owner].extend(pgroup)
        for i, rgroup in enumerate(rules):
            members = rgroup + attached[i]
            out.append(_merge(members))
    order = {sc: i for i, sc in enumerate(proto.scs)}
    ordered = sorted(
        out,
        key=lambda f: (
            order.get(f.sc, 99),
            f.focus_index if f.focus_index is not None else -1,
            f.bbox.y if f.bbox else 0,
            f.bbox.x if f.bbox else 0,
        ),
    )
    return [f.model_copy(update={"id": f"f{i + 1:03d}"}) for i, f in enumerate(ordered)]
