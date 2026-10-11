from build import icon, page, shape

MINUS = "−"

CRITERIA = [
    ("1.4.3", "Contrast (Minimum)"),
    ("1.4.11", "Non-text Contrast"),
    ("2.4.7", "Focus Visible"),
    ("2.4.11", "Focus Not Obscured (Minimum)"),
    ("2.4.12", "Focus Not Obscured (Enhanced)"),
    ("2.4.13", "Focus Appearance"),
    ("2.5.7", "Dragging Movements"),
    ("2.5.8", "Target Size (Minimum)"),
]
NAMES = dict(CRITERIA)

# tables.md, "hybrid, real" and "rule_only, real": TP + FN, recall, 95% CI
RECALL_N = {"1.4.3": 1381, "1.4.11": 96, "2.4.7": 126, "2.4.11": 11, "2.4.12": 15, "2.4.13": 373, "2.5.7": 0, "2.5.8": 34}
RECALL_H = {
    "1.4.3": (0.765, 0.67, 0.84),
    "1.4.11": (0.438, 0.22, 0.59),
    "2.4.7": (0.667, 0.48, 0.84),
    "2.4.11": (1.000, 1.00, 1.00),
    "2.4.12": (0.000, 0.00, 0.00),
    "2.4.13": (0.879, 0.81, 0.94),
    "2.5.8": (0.794, 0.50, 1.00),
}
RECALL_R = {"1.4.3": (0.625, 0.52, 0.73), "2.5.8": (0.794, 0.50, 1.00)}

# tables.md, "McNemar ... real": only hybrid correct, only rule-only correct, p (BH)
MCNEMAR = {
    "1.4.3": (1, 7, "0.070"),
    "1.4.11": (2, 30, "<0.001"),
    "2.4.7": (84, 40, "<0.001"),
    "2.4.11": (11, 114, "<0.001"),
    "2.4.12": (0, 0, None),
    "2.4.13": (328, 142, "<0.001"),
    "2.5.7": (0, 0, None),
    "2.5.8": (0, 12, "<0.001"),
}

# tables.md, "hybrid, real" and "rule_only, real": precision and 95% CI
PREC_H = {
    "1.4.3": (0.483, 0.40, 0.55),
    "1.4.11": (0.124, 0.04, 0.24),
    "2.4.7": (0.677, 0.51, 0.83),
    "2.4.11": (0.088, 0.01, 0.18),
    "2.4.13": (0.698, 0.60, 0.79),
    "2.5.8": (0.147, 0.06, 0.30),
}
PREC_R = {"1.4.3": (0.497, 0.40, 0.59), "2.5.8": (0.162, 0.07, 0.35)}
PRED_H = {"1.4.3": 1056 + 1131, "2.5.8": 27 + 157}
PRED_R = {"1.4.3": 863 + 873, "2.5.8": 27 + 140}
# tables.md, "McNemar ... real": dPrecision 95% CI. Point = hybrid precision minus rule-only precision.
DPREC = {"1.4.3": (-0.014, -0.070, 0.042), "2.5.8": (-0.015, -0.059, -0.004)}
MARGIN = -0.05

# eval/detector/REPORT.md
AP = [("link", 0.3491), ("text", 0.3401), ("input", 0.3030), ("button", 0.1834), ("choice", 0.1580), ("image_icon", 0.1020)]

REPRO = [
    ("Run", "2026-10-11-full"),
    ("Benchmark sha", "a3bb94577287"),
    ("Protocol sha", "a46020528ec1"),
    ("Model sha", "2e3053dc6433"),
    ("Seed", "20261004"),
    ("Bootstrap", "10,000"),
    ("Command", "make eval"),
]


def sgn(v: float, places: int = 3) -> str:
    s = f"{abs(v):.{places}f}"
    return (MINUS if v < 0 else "+" if v > 0 else "") + s


def ci(lo: float, hi: float) -> str:
    return f"[{lo:.2f}, {hi:.2f}]"


def ci_s(lo: float, hi: float) -> str:
    return f"[{sgn(lo)}, {sgn(hi)}]"


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;")


def legend() -> str:
    return (
        '<ul class="legend">'
        '<li><svg width="16" height="12" aria-hidden="true"><line x1="0" x2="16" y1="6" y2="6" stroke="var(--accent)" stroke-width="2"/><circle cx="8" cy="6" r="5" fill="var(--accent)"/></svg>Hybrid</li>'
        '<li><svg width="16" height="12" aria-hidden="true"><line x1="0" x2="16" y1="6" y2="6" stroke="var(--ink-2)" stroke-width="1.5"/><circle cx="8" cy="6" r="4.4" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="2"/></svg>Rule-only</li>'
        '<li><svg width="16" height="12" aria-hidden="true"><line x1="1" x2="15" y1="6" y2="6" stroke="var(--ink-2)" stroke-width="1.5"/><line x1="1" x2="1" y1="2" y2="10" stroke="var(--ink-2)" stroke-width="1.5"/><line x1="15" x2="15" y1="2" y2="10" stroke="var(--ink-2)" stroke-width="1.5"/></svg>95% interval</li>'
        "</ul>"
    )


def recall_chart() -> str:
    W, PX0, PW, TOP, RH = 1000, 372, 340, 32, 66
    RX = 742
    H = TOP + RH * len(CRITERIA) + 6
    x = lambda v: PX0 + PW * v
    out = [f'<svg class="plot" viewBox="0 0 {W} {H}" role="img" aria-label="Recall by criterion on real pages, hybrid against rule-only, with 95% intervals. Rule-only cannot decide five of the eight criteria." xmlns="http://www.w3.org/2000/svg">']
    out.append(f'<text class="hd" x="0" y="16">Criterion and failures in truth (n)</text><text class="hd" x="{RX}" y="16">Recall [95% interval]</text>')
    for v in (0, 0.25, 0.5, 0.75, 1):
        out.append(f'<line class="grid" x1="{x(v):.1f}" x2="{x(v):.1f}" y1="{TOP - 4}" y2="{H - 4}"/><text class="tick" x="{x(v):.1f}" y="16" text-anchor="middle">{v:g}</text>')
    for i, (code, name) in enumerate(CRITERIA):
        t = TOP + i * RH
        yh, yr = t + 24, t + 46
        n = RECALL_N[code]
        out.append(f'<line class="rule" x1="0" x2="{W}" y1="{t + RH}" y2="{t + RH}"/>')
        out.append(f'<text class="sc" x="0" y="{t + 28}">{code}</text><text class="nm" x="56" y="{t + 28}">{name}</text>')
        sub = f"n = {n:,}"
        if 0 < n < 30:
            sub += " · interval not informative at this sample size"
        out.append(f'<text class="sub" x="56" y="{t + 47}">{sub}</text>')
        if n == 0:
            out.append(f'<text class="note knock" x="{PX0 + 8}" y="{yh + 4}">No failures on real pages in the truth data</text>')
            out.append(f'<text class="ser" x="{RX}" y="{yh + 4}">Hybrid</text><text class="val" x="{RX + 76}" y="{yh + 4}">n/a</text>')
            out.append(f'<text class="ser" x="{RX}" y="{yr + 4}">Rule-only</text><text class="val" x="{RX + 76}" y="{yr + 4}">n/a</text>')
            continue
        # rule-only lane first so the hybrid marker sits on top
        if code in RECALL_R:
            v, lo, hi = RECALL_R[code]
            if n >= 30:
                out.append(f'<line class="wk r" x1="{x(lo):.1f}" x2="{x(hi):.1f}" y1="{yr}" y2="{yr}"/><line class="wk r" x1="{x(lo):.1f}" x2="{x(lo):.1f}" y1="{yr - 4}" y2="{yr + 4}"/><line class="wk r" x1="{x(hi):.1f}" x2="{x(hi):.1f}" y1="{yr - 4}" y2="{yr + 4}"/>')
            out.append(f'<circle class="mk r" cx="{x(v):.1f}" cy="{yr}" r="5"/>')
            out.append(f'<text class="ser" x="{RX}" y="{yr + 4}">Rule-only</text><text class="val" x="{RX + 76}" y="{yr + 4}">{v:.3f}</text><text class="ci" x="{RX + 124}" y="{yr + 4}">{ci(lo, hi)}</text>')
        else:
            out.append(f'<text class="note knock" x="{PX0 + 8}" y="{yr + 4}">Rule-only cannot decide this criterion</text>')
            out.append(f'<text class="ser" x="{RX}" y="{yr + 4}">Rule-only</text><text class="val" x="{RX + 76}" y="{yr + 4}">n/a</text>')
        v, lo, hi = RECALL_H[code]
        if n >= 30:
            out.append(f'<line class="wk h" x1="{x(lo):.1f}" x2="{x(hi):.1f}" y1="{yh}" y2="{yh}"/><line class="wk h" x1="{x(lo):.1f}" x2="{x(lo):.1f}" y1="{yh - 4}" y2="{yh + 4}"/><line class="wk h" x1="{x(hi):.1f}" x2="{x(hi):.1f}" y1="{yh - 4}" y2="{yh + 4}"/>')
        out.append(f'<circle class="mk h" cx="{x(v):.1f}" cy="{yh}" r="5.5"/>')
        cit = ci(lo, hi) if n >= 30 else ""
        out.append(f'<text class="ser" x="{RX}" y="{yh + 4}">Hybrid</text><text class="val" x="{RX + 76}" y="{yh + 4}">{v:.3f}</text><text class="ci" x="{RX + 124}" y="{yh + 4}">{cit}</text>')
    out.append("</svg>")
    return "".join(out)


def recall_table() -> str:
    rows = []
    for code, name in CRITERIA:
        n = RECALL_N[code]
        if code in RECALL_H and n > 0:
            v, lo, hi = RECALL_H[code]
            h = f'<span class="num">{v:.3f}</span> <span class="t-faint num">{ci(lo, hi)}</span>'
            if n < 30:
                h += '<div class="t-faint sm">interval not informative at this sample size</div>'
        else:
            h = '<span class="t-faint">n/a</span>'
        if code in RECALL_R:
            v, lo, hi = RECALL_R[code]
            r = f'<span class="num">{v:.3f}</span> <span class="t-faint num">{ci(lo, hi)}</span>'
        elif n == 0:
            r = '<span class="t-faint">n/a</span>'
        else:
            r = '<span class="t-muted">Rule-only cannot decide this criterion</span>'
        rows.append(f'<tr><td><span class="sc">{code}</span> {name}</td><td class="r num">{n:,}</td><td>{h}</td><td>{r}</td></tr>')
    return f"""<table class="data"><caption class="sr">Recall by criterion on real pages, hybrid and rule-only</caption>
<thead><tr><th scope="col">Criterion</th><th scope="col" class="r">Failures (n)</th><th scope="col">Hybrid recall [95% interval]</th><th scope="col">Rule-only recall [95% interval]</th></tr></thead><tbody>{"".join(rows)}</tbody></table>"""


def verdict1(code: str) -> tuple[str, str]:
    oh, orr, p = MCNEMAR[code]
    if p is None:
        return "none", "No differing outcomes, so no test"
    if p == "<0.001" or float(p) < 0.05:
        return ("h", "Hybrid is better, unlikely to be chance") if oh > orr else ("r", "Rule-only is better, unlikely to be chance")
    return "close", "Too close to call"


def verdict_mark(kind: str) -> str:
    if kind == "h":
        return '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--accent)"/></svg>'
    if kind == "r":
        return '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.2" fill="var(--surface)" stroke="var(--ink-2)" stroke-width="2"/></svg>'
    return '<svg width="12" height="12" aria-hidden="true"><line x1="2" x2="10" y1="6" y2="6" stroke="var(--ink-3)" stroke-width="2"/></svg>'


def mcnemar_table() -> str:
    rows = []
    for code, name in CRITERIA:
        oh, orr, p = MCNEMAR[code]
        kind, words = verdict1(code)
        tot = oh + orr
        bal = (
            f'<span class="bal" aria-hidden="true"><i style="width:{oh / tot * 100:.1f}%"></i><b style="width:{orr / tot * 100:.1f}%"></b></span>'
            if tot
            else '<span class="bal none" aria-hidden="true"></span>'
        )
        ptxt = p if p else "n/a"
        rows.append(
            f'<tr><td><span class="sc">{code}</span> {name}</td><td class="r num">{oh:,}</td><td class="r num">{orr:,}</td><td>{bal}</td>'
            f'<td class="r num">{ptxt}</td><td><span class="vd">{verdict_mark(kind)}{words}</span></td></tr>'
        )
    return f"""<table class="data"><caption class="sr">Paired comparison of hybrid and rule-only on real pages, exact McNemar test</caption>
<thead><tr><th scope="col">Criterion</th><th scope="col" class="r">Only hybrid right</th><th scope="col" class="r">Only rule-only right</th><th scope="col"><span class="sr">Balance</span></th><th scope="col" class="r">p (BH)</th><th scope="col">Verdict</th></tr></thead><tbody>{"".join(rows)}</tbody></table>"""


def prec_chart() -> str:
    W, PX0, PW, TOP, RH = 1000, 372, 340, 32, 56
    RX = 742
    LO, HI = -0.10, 0.06
    H = TOP + RH * len(CRITERIA) + 44
    x = lambda v: PX0 + PW * (v - LO) / (HI - LO)
    plot_b = TOP + RH * len(CRITERIA)
    out = [f'<svg class="plot" viewBox="0 0 {W} {H}" role="img" aria-label="Difference in precision, hybrid minus rule-only, on real pages, with 95% intervals against a margin of minus 0.05. Two criteria are estimable and neither shows non-inferiority." xmlns="http://www.w3.org/2000/svg">']
    out.append(f'<rect class="zone" x="{x(LO):.1f}" y="{TOP - 4}" width="{x(MARGIN) - x(LO):.1f}" height="{plot_b - TOP + 4}"/>')
    out.append(f'<text class="hd" x="0" y="16">Criterion and predictions (n)</text><text class="hd" x="{RX}" y="16">Difference [95% interval] and verdict</text>')
    for v in (-0.10, -0.05, 0, 0.05):
        out.append(f'<text class="tick" x="{x(v):.1f}" y="16" text-anchor="middle">{sgn(v, 2) if v else "0"}</text>')
    out.append(f'<line class="grid" x1="{x(0):.1f}" x2="{x(0):.1f}" y1="{TOP - 4}" y2="{plot_b}" style="stroke:var(--ink-3)"/>')
    out.append(f'<line class="marg" x1="{x(MARGIN):.1f}" x2="{x(MARGIN):.1f}" y1="{TOP - 4}" y2="{plot_b}"/>')
    for i, (code, name) in enumerate(CRITERIA):
        t = TOP + i * RH
        y = t + 24
        out.append(f'<line class="rule" x1="0" x2="{W}" y1="{t + RH}" y2="{t + RH}"/>')
        out.append(f'<text class="sc" x="0" y="{t + 24}">{code}</text><text class="nm" x="56" y="{t + 24}">{name}</text>')
        if code in DPREC:
            v, lo, hi = DPREC[code]
            out.append(f'<text class="sub" x="56" y="{t + 43}">n = {PRED_H[code]:,} hybrid and {PRED_R[code]:,} rule-only predictions</text>')
            out.append(f'<line class="wk h" x1="{x(lo):.1f}" x2="{x(hi):.1f}" y1="{y}" y2="{y}"/><line class="wk h" x1="{x(lo):.1f}" x2="{x(lo):.1f}" y1="{y - 5}" y2="{y + 5}"/><line class="wk h" x1="{x(hi):.1f}" x2="{x(hi):.1f}" y1="{y - 5}" y2="{y + 5}"/>')
            out.append(f'<circle class="mk h" cx="{x(v):.1f}" cy="{y}" r="5.5"/>')
            out.append(f'<text class="val" x="{RX}" y="{y - 2}">{sgn(v)}</text><text class="ci" x="{RX + 52}" y="{y - 2}">{ci_s(lo, hi)}</text>')
            out.append(f'<text class="vdt" x="{RX}" y="{y + 16}">Not shown</text><text class="sub" x="{RX + 76}" y="{y + 16}">lower bound {sgn(lo)} is below {sgn(MARGIN, 2)}</text>')
        else:
            out.append(f'<text class="sub" x="56" y="{t + 43}">n = 0 rule-only predictions</text>')
            out.append(f'<text class="note knock" x="{PX0 + 8}" y="{y + 4}">Not estimable: rule-only makes no predictions</text>')
            out.append(f'<text class="val" x="{RX}" y="{y - 2}">n/a</text><text class="vdt" x="{RX}" y="{y + 16}">Not shown</text>')
    by = plot_b + 18
    out.append(f'<text class="tick" x="{x(MARGIN):.1f}" y="{by}" text-anchor="middle">Margin {sgn(MARGIN, 2)} (dashed)</text>')
    out.append(f'<text class="tick" x="{x(0):.1f}" y="{by}" text-anchor="middle">No difference</text>')
    out.append(f'<text class="tick" x="{(x(LO) + x(MARGIN)) / 2:.1f}" y="{by + 14}" text-anchor="middle">Beyond the margin</text>')
    out.append("</svg>")
    return "".join(out)


def prec_table() -> str:
    rows = []
    for code, name in CRITERIA:
        hp = PREC_H.get(code)
        rp = PREC_R.get(code)
        h = f'<span class="num">{hp[0]:.3f}</span> <span class="t-faint num">{ci(hp[1], hp[2])}</span>' if hp else '<span class="t-faint">n/a</span>'
        r = f'<span class="num">{rp[0]:.3f}</span> <span class="t-faint num">{ci(rp[1], rp[2])}</span>' if rp else '<span class="t-faint">n/a</span>'
        if code in DPREC:
            v, lo, hi = DPREC[code]
            d = f'<span class="num">{ci_s(lo, hi)}</span>'
        else:
            d = '<span class="t-faint">not estimable</span>'
        rows.append(f'<tr><td><span class="sc">{code}</span> {name}</td><td>{h}</td><td>{r}</td><td>{d}</td><td>Not shown</td></tr>')
    return f"""<table class="data"><caption class="sr">Precision on real pages and the paired difference against the minus 0.05 margin</caption>
<thead><tr><th scope="col">Criterion</th><th scope="col">Hybrid precision [95% interval]</th><th scope="col">Rule-only precision [95% interval]</th><th scope="col">Difference 95% interval</th><th scope="col">Non-inferior</th></tr></thead><tbody>{"".join(rows)}</tbody></table>"""


def ap_chart() -> str:
    W, PX0, PW, RH, TOP = 560, 96, 380, 34, 24
    MAXV = 0.5
    H = TOP + RH * len(AP) + 6
    x = lambda v: PX0 + PW * v / MAXV
    out = [f'<svg class="plot" viewBox="0 0 {W} {H}" role="img" aria-label="Average precision at IoU 0.50 to 0.95 for each element class: link 0.349, text 0.340, input 0.303, button 0.183, choice 0.158, image_icon 0.102." xmlns="http://www.w3.org/2000/svg">']
    for v in (0, 0.1, 0.2, 0.3, 0.4, 0.5):
        out.append(f'<line class="grid" x1="{x(v):.1f}" x2="{x(v):.1f}" y1="{TOP - 6}" y2="{H - 2}"/><text class="tick" x="{x(v):.1f}" y="12" text-anchor="middle">{v:g}</text>')
    for i, (cls, v) in enumerate(AP):
        y = TOP + i * RH
        out.append(f'<text class="nm" x="0" y="{y + 20}">{cls}</text>')
        out.append(f'<rect class="apbar" x="{PX0}" y="{y + 9}" width="{PW * v / MAXV:.1f}" height="12" rx="2"/>')
        out.append(f'<text class="val" x="{x(v) + 8:.1f}" y="{y + 19}">{v:.3f}</text>')
    out.append("</svg>")
    return "".join(out)


def ap_table() -> str:
    rows = "".join(f'<tr><td class="mono">{c}</td><td class="r num">{v:.4f}</td></tr>' for c, v in AP)
    return f"""<table class="data"><caption class="sr">Average precision by element class</caption>
<thead><tr><th scope="col">Class</th><th scope="col" class="r">AP 50:95</th></tr></thead><tbody>{rows}</tbody></table>"""


def seg(label: str) -> str:
    return f'<div class="seg sm" role="group" aria-label="{label}" data-view><button aria-pressed="true" data-v="chart">Chart</button><button aria-pressed="false" data-v="table">Table</button></div>'


def chart_panel(pid: str, title: str, chart: str, table: str, with_legend: bool = True, note: str = "") -> str:
    return f"""
<div class="panel" role="group" aria-labelledby="{pid}-t">
  <div class="panel-head"><h3 id="{pid}-t" class="t-section">{title}</h3>{seg(f"{title} view")}</div>
  <div class="panel-body" data-pane="chart">{legend() if with_legend else ""}{chart}{f'<p class="note-line">{note}</p>' if note else ""}</div>
  <div data-pane="table" hidden>{table}</div>
</div>"""


def repro() -> str:
    items = "".join(
        f'<div><dt>{k}</dt><dd class="mono{" cmd" if k == "Command" else ""}">{v}</dd></div>' for k, v in REPRO
    )
    return f"""
<section class="panel repro" aria-labelledby="rep-h">
  <h2 id="rep-h" class="t-eyebrow">Reproduce</h2>
  <dl>{items}</dl>
</section>"""


def howto() -> str:
    cols = [
        ("Marks", "Filled navy is the hybrid, hollow grey is rule-only. n is the number of true failures in the truth data."),
        ("Intervals", "Lines are 95% bootstrap intervals from 10,000 resamples. Below n = 30 they are not drawn as informative."),
        ("Verdicts", "Words come from the paired exact test (Benjamini-Hochberg adjusted) and a precision margin of " + MINUS + "0.05."),
    ]
    items = "".join(f'<div><h3 class="t-eyebrow">{a}</h3><p>{b}</p></div>' for a, b in cols)
    return f'<section class="panel howto" aria-labelledby="how-h"><h2 id="how-h" class="sr">How to read this</h2>{items}</section>'


def detector() -> str:
    cards = [
        ("mAP 50:95", "0.239", "ONNX on CPU, WebUI validation split, 1,500 images and 47,194 boxes."),
        ("mAP 50", "0.394", "Same model and split."),
        ("Label noise", "33.5%", "AI-assisted review of 200 boxes, 95% CI ±6.5. No human pass yet."),
    ]
    cs = "".join(
        f'<article class="panel stat"><div class="t-label">{a}</div><div class="num statv">{b}</div><p>{c}</p></article>' for a, b, c in cards
    )
    side_note = """<ul class="plain">
      <li>Single-image inference, each image squashed to 576 by 576. This is not the accuracy of the tiled pipeline.</li>
      <li>The split is held-out WebUI validation, not the 110-page benchmark.</li>
      <li>Training and validation labels are roughly one third noisy, so these scores are a lower bound.</li>
      <li>Per-class box counts for the split are not recorded in the report.</li>
    </ul>"""
    return f"""
<section class="sec" aria-labelledby="det-h">
  <div class="sec-head"><h2 id="det-h" class="t-section">The element detector</h2><p>The detector is weak on small and ambiguous elements. Findings that depend on it are marked as needing review.</p></div>
  <div class="cards3">{cs}</div>
  <div class="grid-2e">
    {chart_panel("ap", "Average precision by class", ap_chart(), ap_table(), with_legend=False, note="AP 50:95, bars start at 0 and the scale ends at 0.5.")}
    <div class="panel"><div class="panel-head"><h3 class="t-section">What this measures</h3></div><div class="panel-body">{side_note}</div></div>
  </div>
</section>"""


def limits() -> str:
    items = [
        ("review", "<b>Label noise.</b> A one-third noise rate (AI-assisted, 200 boxes, CI ±6.5) bounds what the detector can show. Button, input and choice had 5 boxes between them, so their noise is unmeasured."),
        ("undecided", "<b>Small samples.</b> Real pages hold 11 failures for 2.4.11, 15 for 2.4.12, 34 for 2.5.8 and none for 2.5.7. Intervals under n = 30 are not informative."),
        ("critical", "<b>False alarms.</b> Hybrid precision on real pages is 0.088 for 2.4.11, 0.124 for 1.4.11 and 0.147 for 2.5.8. Real 2.4.12 recall is 0.000 (0 of 15)."),
        ("done", "<b>Two headline runs.</b> Without the detector (2026-10-10) and with it (2026-10-11) are both reported. On real pages 1.4.11 recall moves from 0.000 to 0.438, and hybrid 2.5.8 precision from 0.162 to 0.147."),
        ("pass", "<b>Coverage.</b> The tool checks 8 of the 86 WCAG 2.2 success criteria. A result is not a conformance claim."),
    ]
    lis = "".join(f"<li>{shape(s)}<span>{t}</span></li>" for s, t in items)
    return f"""
<section class="sec" aria-labelledby="lim-h">
  <div class="sec-head"><h2 id="lim-h" class="t-section">Limits</h2></div>
  <div class="panel"><ul class="limits">{lis}</ul></div>
</section>"""


CSS = """
[hidden]{display:none!important}
.sec{margin-top:32px}
.sec-head{margin-bottom:12px;max-width:78ch}
.sec-head p{margin:4px 0 0;color:var(--ink-2)}
.sec .stack{gap:16px}
.page-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.page-actions .seg{align-self:center}
.repro{padding:12px 16px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.repro dl{margin:0;display:flex;gap:24px 32px;flex-wrap:wrap}
.repro dt{font-size:0.6875rem;line-height:1rem;font-weight:500;color:var(--ink-3)}
.repro dd{margin:0;font-size:0.75rem;line-height:1.25rem;color:var(--ink)}
.repro dd.cmd{background:var(--subtle);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 6px}
.howto{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.howto>div{padding:12px 16px;border-left:1px solid var(--line)}
.howto>div:first-of-type{border-left:0}
.howto p{margin:4px 0 0;color:var(--ink-2);font-size:0.8125rem;line-height:1.25rem}
.legend{list-style:none;margin:0 0 8px;padding:0;display:flex;gap:24px;flex-wrap:wrap;font-size:0.8125rem;color:var(--ink-2)}
.legend li{display:inline-flex;align-items:center;gap:8px}
.plot{display:block;width:100%;height:auto}.panel-head .seg{align-self:center}table.data .sc{margin-right:8px}
.plot text{font-family:var(--font);fill:var(--ink-2);font-size:13px}
.plot .hd{font-size:11.5px;font-weight:500;fill:var(--ink-3)}
.plot .tick{font-size:11.5px;fill:var(--ink-3);font-variant-numeric:tabular-nums}
.plot .sc{font-family:var(--mono);font-size:12px;fill:var(--ink-3)}
.plot .nm{font-size:13.5px;font-weight:500;fill:var(--ink)}
.plot .sub{font-size:11.5px;fill:var(--ink-3)}
.plot .ser{font-size:12px;fill:var(--ink-3)}
.plot .val{font-size:13.5px;font-weight:600;fill:var(--ink);font-variant-numeric:tabular-nums slashed-zero}
.plot .ci{font-size:12px;fill:var(--ink-3);font-variant-numeric:tabular-nums slashed-zero}
.plot .vdt{font-size:12.5px;font-weight:600;fill:var(--ink)}
.plot .note{font-size:12.5px;fill:var(--ink-2)}
.plot .knock{paint-order:stroke;stroke:var(--surface);stroke-width:5px;stroke-linejoin:round}
.plot .grid{stroke:var(--line);stroke-width:1}
.plot .rule{stroke:var(--line);stroke-width:1}
.plot .marg{stroke:var(--ink-2);stroke-width:1.5;stroke-dasharray:5 4}
.plot .zone{fill:var(--subtle)}
.plot .mk.h{fill:var(--accent)}
.plot .mk.r{fill:var(--surface);stroke:var(--ink-2);stroke-width:2}
.plot .wk{stroke-width:1.75}
.plot .wk.h{stroke:var(--accent);stroke-width:2}
.plot .wk.r{stroke:var(--ink-2);stroke-width:1.5}
.plot .apbar{fill:var(--line-strong)}
.note-line{margin:8px 0 0;font-size:0.75rem;color:var(--ink-3)}
.panel [data-pane="table"] table.data td{height:44px}
.sm{font-size:0.75rem}
.vd{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.vd svg{flex:none}
.bal{display:flex;width:112px;height:6px;border-radius:3px;overflow:hidden;background:var(--track);gap:2px}
.bal i{display:block;background:var(--accent);height:100%}
.bal b{display:block;background:var(--line-strong);height:100%}
.bal.none{background:repeating-linear-gradient(135deg,var(--line-strong) 0 2px,transparent 2px 4px);opacity:.5}
.cap{margin:0;padding:12px 16px;border-top:1px solid var(--line);font-size:0.8125rem;color:var(--ink-2)}
.cards3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.stat{padding:16px}
.statv{font-size:1.75rem;line-height:2.25rem;font-weight:600;letter-spacing:-0.02em;margin-top:4px}
.stat p{margin:4px 0 0;font-size:0.8125rem;line-height:1.25rem;color:var(--ink-2)}
.grid-2e{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:16px;margin-top:16px}
.plain{margin:0;padding:0;list-style:none}
.plain li{padding:8px 0;border-bottom:1px solid var(--line);font-size:0.8125rem;line-height:1.25rem;color:var(--ink-2)}
.plain li:first-child{padding-top:0}.plain li:last-child{border-bottom:0;padding-bottom:0}
.limits{list-style:none;margin:0;padding:8px 16px}
.limits li{display:grid;grid-template-columns:16px 1fr;gap:10px;padding:12px 0;font-size:0.8125rem;line-height:1.25rem;color:var(--ink-2);border-bottom:1px solid var(--line);max-width:110ch}
.limits li:last-child{border-bottom:0}
.limits svg{width:12px;height:12px;margin-top:4px;color:var(--ink-3)}
.limits b{color:var(--ink);font-weight:600}
@media (max-width:1100px){.cards3{grid-template-columns:1fr}.grid-2e{grid-template-columns:minmax(0,1fr)}.howto{grid-template-columns:1fr}.howto>div{border-left:0;border-top:1px solid var(--line)}.howto>div:first-of-type{border-top:0}}
@media (max-width:720px){.panel-body{overflow-x:auto}.plot{min-width:640px}}
"""

SCRIPT = """<script>document.querySelectorAll('[data-view]').forEach(function(g){g.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;g.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});g.closest('.panel').querySelectorAll('[data-pane]').forEach(function(el){el.hidden=el.dataset.pane!==b.dataset.v})})})</script>"""


def claim1() -> str:
    lead = (
        "Rule-only cannot decide five of the eight criteria on real pages. The hybrid finds failures on four of them, with recall from 0.438 to 1.000, "
        "and none of the 15 real 2.4.12 failures. It also raises false alarms where rule-only stays silent, which the paired table shows."
    )
    cap = (
        "A unit counts as right when its outcome matches the truth data. Where rule-only reports nothing, only hybrid right counts failures the hybrid found, "
        "and only rule-only right counts hybrid false alarms."
    )
    return f"""
<section class="sec" aria-labelledby="c1-h">
  <div class="sec-head"><h2 id="c1-h" class="t-section">Question 1: does the hybrid find failures that rules cannot?</h2><p>{lead}</p></div>
  <div class="stack">
    {chart_panel("rc", "Recall by criterion, real pages", recall_chart(), recall_table())}
    <div class="panel" role="group" aria-labelledby="mc-t">
      <div class="panel-head"><h3 id="mc-t" class="t-section">Paired comparison, real pages</h3><span class="t-faint t-dense">Exact McNemar, Benjamini-Hochberg adjusted</span></div>
      {mcnemar_table()}
      <p class="cap">{cap}</p>
    </div>
  </div>
</section>"""


def claim2() -> str:
    lead = (
        "Precision can be compared only on 1.4.3 and 2.5.8, the two criteria where rule-only makes predictions on real pages. "
        "On both, the lower bound of the interval falls below the " + MINUS + "0.05 margin, so non-inferiority is not shown."
    )
    return f"""
<section class="sec" aria-labelledby="c2-h">
  <div class="sec-head"><h2 id="c2-h" class="t-section">Question 2: is precision kept?</h2><p>{lead}</p></div>
  {chart_panel("pc", "Precision difference, hybrid minus rule-only, real pages", prec_chart(), prec_table(), with_legend=False, note="Point is the hybrid precision minus the rule-only precision from the real-page tables. Intervals are the paired bootstrap intervals.")}
</section>"""


def render() -> str:
    head = f"""
      <div class="page-head">
        <div><h1 class="t-page">Evaluation</h1><p>How well each criterion is detected on the frozen benchmark, and whether the detector helps.</p></div>
        <div class="page-actions">
          <div class="seg" role="group" aria-label="Page set"><button aria-pressed="true">Real pages</button><button aria-pressed="false">Synthetic</button><button aria-pressed="false">Combined</button></div>
          <button class="btn">{icon("i-export")}Export CSV</button>
          <button class="btn">{icon("i-export")}Export LaTeX</button>
        </div>
      </div>
      {repro()}
      {howto()}"""
    content = head + claim1() + claim2() + detector() + limits() + SCRIPT
    return page("Evaluation - WCAG Auditor", "eval", "<a href=\"#\">Research</a>" + icon("i-chevron") + "<b>Evaluation</b>", content, CSS)
