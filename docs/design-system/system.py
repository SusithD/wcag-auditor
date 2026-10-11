from build import icon, page, shape, status


def lum(h: str) -> float:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))

    def f(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def cr(a: str, b: str) -> float:
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


NEUTRALS = [
    ("Canvas", "#F6F7F9", "page background"),
    ("Surface", "#FFFFFF", "panels, sidebar"),
    ("Subtle", "#F1F2F6", "hover, wells"),
    ("Line", "#E4E6EC", "dividers only"),
    ("Line strong", "#7C8595", "control borders, 3.7:1"),
    ("Ink 3", "#62657C", "tertiary text"),
    ("Ink 2", "#44465E", "secondary text"),
    ("Ink", "#0C0C2C", "primary text, tinted toward navy"),
]
BRAND = [
    ("Navy", "#000055", "primary action, selection, focus"),
    ("Navy 700", "#24247F", "primary hover"),
    ("Tint", "#EEEEF7", "selected rows and nav"),
    ("Dark accent", "#B4B4EC", "focus, links and selection in dark mode"),
]
STATUS = [
    ("critical", "Critical", "#A8281F", "#FF8F85"),
    ("serious", "Serious", "#9A4300", "#F2A054"),
    ("minor", "Minor", "#9B2D6F", "#F0A0CB"),
    ("review", "Needs review", "#0B6384", "#6FC4E8"),
    ("pass", "No issue found", "#44465E", "#B3B5C3"),
    ("undecided", "Could not decide", "#44465E", "#B3B5C3"),
]


def swatch(name: str, hexv: str, note: str) -> str:
    on_white = cr(hexv, "#FFFFFF")
    return f"""<div class="swatch"><div class="chip" style="background:{hexv}"></div><div class="sw-meta"><b>{name}</b><span class="mono">{hexv}</span><span class="t-faint">{note}</span><span class="t-faint num">{on_white:.2f}:1 on white</span></div></div>"""


def section(title: str, sub: str, body: str) -> str:
    return f'<section class="ds-sec"><div class="ds-h"><h2 class="t-section">{title}</h2><p class="t-faint">{sub}</p></div>{body}</section>'


def render() -> str:
    neutrals = "".join(swatch(*n) for n in NEUTRALS)
    brand = "".join(swatch(*b) for b in BRAND)
    statuses = "".join(
        f"""<div class="srow"><span class="status s-{k} strong">{shape(k)}{label}</span><span class="tag tag-{k}">{shape(k)}{label}</span><span class="mono">{lt}</span><span class="num t-faint">{cr(lt, "#F1F2F6"):.2f}:1 on subtle</span><span class="mono">{dk}</span><span class="num t-faint">{cr(dk, "#1A1B24"):.2f}:1 dark</span></div>"""
        for k, label, lt, dk in STATUS
    )
    type_rows = "".join(
        f'<div class="trow"><span class="t-faint mono">{spec}</span><span style="{css}">{sample}</span></div>'
        for spec, css, sample in [
            ("Page title 22/28 600", "font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.01em", "marlowegreen.example"),
            ("Section 15/20 600", "font-size:15px;line-height:20px;font-weight:600", "Recent audits"),
            ("Body 14/20 400", "font-size:14px;line-height:20px", "This paragraph has a contrast of 4.48:1. Body text at this size needs at least 4.5:1."),
            ("Dense 13/18 400", "font-size:13px;line-height:18px", "Box estimated by the detector; real edge unknown"),
            ("Label 12/16 500", "font-size:12px;line-height:16px;font-weight:500;color:var(--ink-3)", "Criteria decided per audit"),
            ("Metric 26/32 600 tabular", "font-size:26px;line-height:32px;font-weight:600;font-variant-numeric:tabular-nums", "1,284 · 6.4 of 8"),
            ("Data mono 12/16", "font-family:var(--mono);font-size:12px", "1.4.3 · section#story > p.story · #767676"),
        ]
    )
    components = f"""
<div class="comp-grid">
  <div class="panel panel-body comp">
    <div class="t-label">Buttons</div>
    <div class="row"><button class="btn btn-primary">{icon("i-plus")}New audit</button><button class="btn">{icon("i-export")}Export</button><button class="btn btn-ghost">View all</button><button class="btn" aria-label="Rerun">{icon("i-rerun")}</button></div>
    <div class="row"><button class="btn btn-primary btn-lg">Run audit</button><button class="btn btn-lg">Cancel</button></div>
    <div class="t-faint" style="font-size:12px">32 px default, 40 px for the main form action. One primary button per view.</div>
  </div>
  <div class="panel panel-body comp">
    <div class="t-label">Inputs</div>
    <div class="field"><label for="u">Web address</label><input id="u" class="input" placeholder="https://example.com"><span class="hint">We open the page in Chromium at desktop and mobile sizes.</span></div>
    <div class="field"><label for="u2">Web address</label><input id="u2" class="input" value="not a url" aria-invalid="true" aria-describedby="u2e"><span id="u2e" class="error">{shape("critical")}Enter a full address such as https://example.com</span></div>
  </div>
  <div class="panel panel-body comp">
    <div class="t-label">Segmented, tabs, focus</div>
    <div class="seg" role="group" aria-label="Viewport"><button aria-pressed="true">{icon("i-desktop")}Desktop</button><button aria-pressed="false">{icon("i-mobile")}Mobile</button></div>
    <nav class="tabs" aria-label="Report"><a href="#" aria-current="page">Report</a><a href="#">Coverage</a><a href="#">Compare</a></nav>
    <div class="row"><button class="btn focusdemo">Focused control</button><span class="t-faint" style="font-size:12px">2 px navy ring, 2 px offset (18.6:1)</span></div>
  </div>
  <div class="panel panel-body comp">
    <div class="t-label">Tier and provenance</div>
    <div class="row"><span class="tag">Automated</span><span class="tag tag-review">{shape("review")}Needs review</span><span class="tag">Rule</span><span class="tag">Pixel</span><span class="tag">Rule and pixel</span></div>
    <div class="t-dense t-muted">Needs review always states the reason, for example "Text size and weight unknown, threshold not settled".</div>
  </div>
</div>"""
    principles = "".join(
        f"<li><b>{t}</b><span>{d}</span></li>"
        for t, d in [
            ("Navy is ink, not paint.", "Primary action, selection, focus and the one highlighted series. Under 5% of any screen."),
            ("Hairlines, not shadows.", "1 px lines define surfaces; shadows only for floating layers such as menus and the canvas toolbar."),
            ("Hierarchy by weight and grey.", "Three text greys and three weights; no colour for emphasis."),
            ("Status is a shape and a word.", "Five distinct silhouettes; colour only on the shape. Never colour alone."),
            ("Numbers are evidence.", "Tabular figures, units, criterion numbers in mono."),
            ("Honest by default.", "No issue found, never passed. 8 of 86 criteria, never a conformance score. A fix is verified only by a new audit."),
        ]
    )
    content = f"""

      <div class="page-head"><div><h1 class="t-page">Design system</h1><p>WCAG Auditor interface language: tokens, type and components. Every pair below is contrast-checked.</p></div><span class="scope">Figtree and Geist Mono · navy #000055 · WCAG 2.2 AA</span></div>
      {section("Principles", "What keeps the interface calm and credible.", f'<ul class="princ">{principles}</ul>')}
      {section("Neutrals", "Cool greys faintly tinted toward the navy.", f'<div class="sw-grid">{neutrals}</div>')}
      {section("Brand", "Deep navy #000055. In dark mode the accent becomes #B4B4EC with navy text on it.", f'<div class="sw-grid">{brand}</div>')}
      {section("Status", "Shape plus word; colour only on the shape. Light and dark values.", f'<div class="panel">{statuses}</div>')}
      {section("Type", "Figtree for the interface, Geist Mono for data. Both open licence, bundled.", f'<div class="panel">{type_rows}</div>')}
      {section("Components", "Base controls. Targets at least 24 px; radius 6 on controls, 8 on panels.", components)}
"""
    css = """
.ds-sec{margin-top:28px}.ds-h{display:flex;align-items:baseline;gap:12px;margin-bottom:12px}.ds-h p{margin:0;font-size:13px}
.sw-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.swatch{background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:hidden}
.swatch .chip{height:56px;border-bottom:1px solid var(--line)}
.sw-meta{display:flex;flex-direction:column;gap:2px;padding:10px 12px;font-size:12px}.sw-meta b{font-size:13px;font-weight:600}
.srow{display:grid;grid-template-columns:180px 170px 90px 1fr 90px 1fr;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);font-size:13px}.srow:last-child{border-bottom:0}
.trow{display:grid;grid-template-columns:220px 1fr;align-items:center;gap:16px;padding:14px 16px;border-bottom:1px solid var(--line)}.trow:last-child{border-bottom:0}
.comp-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.comp{display:flex;flex-direction:column;gap:12px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.focusdemo{outline:2px solid var(--ring);outline-offset:2px}
.princ{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.princ li{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--ink-2)}.princ b{color:var(--ink);font-weight:600;font-size:14px}
"""
    return page("Design system - WCAG Auditor", "settings", "<b>Design system</b>", content, css)
