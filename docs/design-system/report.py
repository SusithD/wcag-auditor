import math

from build import icon, page, ratio, sc, shape, status

VIEW_Y = 1360
VIEW_H = 1090
CROP_Y = 1150

RAIL = [
    ("Failed", "critical", [
        ("1.4.3", "Contrast (Minimum)", "AA", "serious", 2, True),
        ("2.5.8", "Target size (Minimum)", "AA", "minor", 1, False),
        ("2.4.13", "Focus appearance", "AAA", "minor", 3, False),
    ]),
    ("Needs review", "review", [("1.4.11", "Non-text contrast", "AA", "review", 2, False)]),
    ("No issue found", "pass", [
        ("2.4.7", "Focus visible", "AA", "pass", 0, False),
        ("2.4.11", "Focus not obscured", "AA", "pass", 0, False),
    ]),
    ("Could not decide", "undecided", [
        ("2.4.12", "Focus not obscured", "AAA", "undecided", 0, False),
        ("2.5.7", "Dragging movements", "AA", "undecided", 0, False),
    ]),
]

BOXES = [
    dict(x=104, y=1799, w=520, h=128, level="serious", selected=True, estimated=False, label="1.4.3"),
    dict(x=681, y=1417, w=227, h=44, level="review", selected=False, estimated=True, label="1.4.11"),
]

MINIMAP = [(0.12, "minor"), (0.34, "review"), (0.55, "serious"), (0.58, "serious"), (0.82, "minor"), (0.9, "minor")]


def rail() -> str:
    groups = []
    for title, lvl, rows in RAIL:
        items = []
        for code, name, level_tag, level, n, selected in rows:
            count = f'<span class="num rc">{n}<span class="sr"> findings</span></span>' if n else ""
            items.append(
                f"""<li><a href="#" class="rrow{' on' if selected else ''}"{' aria-current="true"' if selected else ''}>
<span class="status s-{level}">{shape(level)}</span>{sc(code)}<span class="rname">{name}</span><span class="level">{level_tag}</span>{count}</a></li>"""
            )
        groups.append(
            f'<div class="rgroup"><h3 class="rtitle"><span>{title}</span><span class="num">{len(rows)}</span></h3><ul>{"".join(items)}</ul></div>'
        )
    return f"""
<nav class="rail" aria-label="Criteria">
  <h2 class="sr">Criteria</h2>
  <div class="rail-top">
    <label class="sr" for="rf">Filter criteria</label>
    <div class="filter">{icon("i-search")}<input id="rf" placeholder="Filter criteria"></div>
    <div class="seg sm" role="group" aria-label="Group by"><button aria-pressed="true">Criterion</button><button aria-pressed="false">Element</button><button aria-pressed="false">Severity</button></div>
  </div>
  {"".join(groups)}
  <p class="rail-note">Severity estimates impact on users. Any failure of an A or AA criterion fails conformance.</p>
</nav>"""


def canvas() -> str:
    marks = []
    for b in BOXES:
        x, y, w, h = b["x"], b["y"], b["w"], b["h"]
        col = "var(--accent)" if b["selected"] else f"var(--{b['level']})"
        dash = ' stroke-dasharray="7 4"' if b["estimated"] else ""
        sw = 4 if b["selected"] else 3
        label = b["label"]
        tag_w = len(label) * 12.5 + 28
        marks.append(f"""
<g class="mark{' sel' if b['selected'] else ''}" role="button" tabindex="{0 if b['selected'] else -1}" aria-label="{'Serious, 1.4.3 Contrast, 4.48 to 1, paragraph in Our story' if b['selected'] else 'Needs review, 1.4.11 Non-text contrast, estimated box, button Ask about volunteering'}"{' aria-pressed="true"' if b['selected'] else ' aria-pressed="false"'}>
  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="{'rgb(0 0 85 / 0.05)' if b['selected'] else 'none'}" stroke="#ffffff" stroke-width="{sw + 5}"/>
  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="3" fill="none" stroke="{col}" stroke-width="{sw}"{dash}/>
  <g transform="translate({x},{y - 42})"><rect width="{tag_w:.0f}" height="34" rx="6" fill="{col if b['selected'] else 'var(--surface)'}" stroke="{col}" stroke-width="1.5"/><text x="14" y="23" font-family="Geist Mono" font-size="20" fill="{'var(--on-accent)' if b['selected'] else 'var(--ink)'}">{label}</text></g>
</g>""")
    ticks = "".join(
        f'<span class="tick s-{lvl}" style="top:{pos * 100:.0f}%" title="Finding at {pos * 100:.0f}% of the page">{shape(lvl)}</span>'
        for pos, lvl in MINIMAP
    )
    return f"""
<section class="stage" aria-labelledby="stage-h">
  <h2 id="stage-h" class="sr">Screenshot</h2>
  <div class="well">
    <div class="frame">
      <svg class="shot" viewBox="0 {VIEW_Y} 1280 {VIEW_H}" role="group" aria-label="Screenshot of marlowegreen.example, desktop, 2 findings in view. The findings table lists every finding.">
        <image href="assets/page.webp" x="0" y="{CROP_Y}" width="1280" height="1300"/>
        {"".join(marks)}
      </svg>
    </div>
    <div class="minimap" aria-hidden="true"><span class="viewport" style="top:30%;height:22%"></span>{ticks}</div>
  </div>
  <div class="toolrow" role="toolbar" aria-label="Screenshot">
    <div class="tgroup">
      <button class="btn btn-ghost btn-icon" aria-label="Zoom out">{icon("i-zoomout")}</button>
      <span class="num t-dense zoom" aria-live="polite">Fit, 66%</span>
      <button class="btn btn-ghost btn-icon" aria-label="Zoom in">{icon("i-zoomin")}</button>
      <button class="btn btn-ghost btn-icon" aria-label="Fit to width">{icon("i-fit")}</button>
    </div>
    <div class="legend" aria-label="Box legend"><span><i class="lg solid"></i>Measured</span><span><i class="lg dashed"></i>Estimated by the detector</span></div>
    <div class="seg sm" role="group" aria-label="Labels"><button aria-pressed="true">Labels</button><button aria-pressed="false">Boxes only</button></div>
  </div>
</section>"""


def ruler(measured: float, required: float) -> str:
    def pos(v: float) -> float:
        return (math.log(v) - math.log(1)) / (math.log(7) - math.log(1)) * 100

    pm, pr = pos(measured), pos(required)
    ticks = "".join(f'<span class="rt" style="left:{pos(v):.1f}%"><i></i>{v:g}</span>' for v in (1, 3, 4.5, 7))
    return f"""
<div class="ruler" role="img" aria-label="Measured 4.48 to 1, required 4.5 to 1, short by 0.02">
  <div class="rtrack"><span class="gap" style="left:{min(pm, pr):.1f}%;width:{abs(pr - pm):.2f}%"></span><span class="req" style="left:{pr:.1f}%"></span><span class="meas" style="left:{pm:.1f}%"></span></div>
  <div class="rticks">{ticks}</div>
</div>"""


def detail() -> str:
    ev = [
        ("Foreground", '<span class="sw" style="background:#777777"></span><span class="mono">#777777</span>'),
        ("Background", '<span class="sw" style="background:#FFFFFF"></span><span class="mono">#FFFFFF</span>'),
        ("Text", '16 px <span class="t-faint">· regular weight · normal text</span>'),
        ("Element", '<span class="mono sel-text">section#story &gt; p.story</span>'),
        ("Found by", 'Browser rule and pixel measurement'),
    ]
    rows = "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in ev)
    return f"""
<section class="detail" aria-labelledby="fd-h">
  <div class="dscroll">
    <div class="dhead">
      <div class="dtags"><span class="tag tag-serious">{shape("serious")}Serious</span><span class="t-faint t-dense">Automated · measured</span></div>
      <h2 id="fd-h" class="dtitle">{sc("1.4.3")}<span>Contrast (Minimum)</span><span class="level">AA</span></h2>
      <div class="bigratio">{ratio("4.48")}<span class="t-faint">needs 4.5:1 · short by <span class="num">0.02</span></span></div>
      {ruler(4.48, 4.5)}
    </div>
    <div class="dsec">
      <h3 class="dlabel">Evidence</h3>
      <dl class="kv">{rows}</dl>
    </div>
    <div class="dsec">
      <div class="dsec-head"><h3 class="dlabel">Suggested fix</h3><div class="seg sm" role="group" aria-label="Fix format"><button aria-pressed="true">CSS</button><button aria-pressed="false">HTML</button></div></div>
      <div class="diff" role="group" aria-label="Suggested CSS change">
        <div class="dl del"><span class="pm" aria-hidden="true">−</span><span class="mono">color: #777777;</span><span class="sw" style="background:#777777"></span></div>
        <div class="dl add"><span class="pm" aria-hidden="true">+</span><span class="mono">color: #767676;</span><span class="sw" style="background:#767676"></span></div>
        <div class="dfootnote">{ratio("4.48")}<span class="t-faint">→</span>{ratio("4.54")}<span class="t-faint">on #FFFFFF</span></div>
      </div>
      <div class="drow"><button class="btn btn-sm">{icon("i-copy")}Copy CSS</button><a class="link" href="#">Understanding 1.4.3{icon("i-ext")}<span class="sr"> (W3C, opens in a new tab)</span></a></div>
    </div>
  </div>
  <div class="dfoot">
    <div class="pager"><button class="btn btn-ghost btn-icon" aria-label="Previous finding" aria-keyshortcuts="K">{icon("i-chevron", "flip")}</button><span class="num t-dense t-muted">1 of 8</span><button class="btn btn-ghost btn-icon" aria-label="Next finding" aria-keyshortcuts="J">{icon("i-chevron")}</button></div>
    <div class="acts"><button class="btn">Dismiss{icon("i-down")}</button><button class="btn btn-primary">{icon("i-check")}Mark as fixed</button></div>
  </div>
</section>"""


def summary() -> str:
    seg = []
    for kind, n in (("on", 5), ("rev", 1), ("und", 2)):
        seg += [kind] * n
    bars = "".join(f'<i class="{k}"></i>' for k in seg)
    return f"""
<section class="panel summary" aria-labelledby="sum-h">
  <h2 id="sum-h" class="sr">Summary</h2>
  <p class="verdict"><b>6 failures</b> in the 5 criteria the tool could decide. <b>2 findings</b> need review, and <b>2 criteria</b> could not be decided on this page.</p>
  <dl class="sumdl">
    <div><dt>Failures</dt><dd><span class="num big">6</span><span class="sev"><span class="status s-critical zero">{shape("critical")}<span class="num">0</span><span class="sr"> critical</span></span><span class="status s-serious">{shape("serious")}<span class="num">2</span><span class="sr"> serious</span></span><span class="status s-minor">{shape("minor")}<span class="num">4</span><span class="sr"> minor</span></span></span></dd></div>
    <div><dt>Needs review</dt><dd><span class="num big">2</span><span class="t-faint t-dense">boxes the detector estimated</span></dd></div>
    <div><dt>Criteria</dt><dd class="col"><span class="meter cov" role="img" aria-label="5 decided, 1 needs review, 2 could not be decided, of 8">{bars}</span><span class="t-faint t-dense"><span class="num">5</span> decided · <span class="num">1</span> to review · <span class="num">2</span> not decided</span></dd></div>
    <div><dt>Since last audit</dt><dd><span class="t-muted t-dense"><span class="num">3</span> fixed · <span class="num">0</span> new · <span class="num">6</span> still present</span></dd></div>
  </dl>
  <p class="claim">This tool checks 8 of the 86 WCAG 2.2 success criteria. <a class="link" href="#">What this result does not mean</a></p>
</section>"""


CSS = """
.flip{transform:rotate(180deg)}
.rhead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
.meta{display:flex;flex-wrap:wrap;gap:6px 16px;color:var(--ink-3);font-size:0.8125rem;margin-top:6px;align-items:center}
.meta span{display:inline-flex;gap:6px;align-items:center}.meta svg{width:14px;height:14px}
.hacts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.viewtabs{margin-top:16px}
.summary{margin-top:16px;padding:16px 16px 12px}
.verdict{margin:0 0 12px;font-size:0.9375rem;line-height:1.375rem;color:var(--ink-2)}.verdict b{color:var(--ink);font-weight:600}
.sumdl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:0;border-top:1px solid var(--line)}
.sumdl>div{padding:12px 16px 4px;border-right:1px solid var(--line)}.sumdl>div:first-child{padding-left:0}.sumdl>div:last-child{border-right:0}
.sumdl dt{font-size:0.75rem;font-weight:500;color:var(--ink-3);margin-bottom:6px}
.sumdl dd{margin:0;display:flex;align-items:center;gap:12px}.sumdl dd.col{flex-direction:column;align-items:flex-start;gap:6px}
.big{font-size:1.25rem;line-height:1.75rem;font-weight:600;color:var(--ink)}
.meter.cov{width:160px}
.claim{margin:10px 0 0;font-size:0.8125rem;color:var(--ink-3);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.work{display:grid;grid-template-columns:288px minmax(0,1fr) 384px;margin-top:16px;min-height:640px;height:calc(100vh - 56px - 48px);max-height:900px}
.rail{border-right:1px solid var(--line);padding:12px;overflow:auto}
.rail-top{display:flex;flex-direction:column;gap:8px;margin-bottom:4px}
.filter{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 10px;border:1px solid var(--line-strong);border-radius:6px;color:var(--ink-3)}
.filter svg{width:14px;height:14px}.filter input{border:0;outline:0;background:transparent;font:400 0.8125rem var(--font);color:var(--ink);width:100%}
.filter:focus-within{outline:2px solid var(--ring);outline-offset:1px}
.rgroup{margin-top:12px}
.rtitle{display:flex;justify-content:space-between;font-size:0.75rem;font-weight:600;color:var(--ink-2);padding:4px 8px;margin:0}
.rtitle .num{color:var(--ink-3);font-weight:500}
.rgroup ul{list-style:none;margin:0;padding:0}
.rrow{display:grid;grid-template-columns:14px 40px minmax(0,1fr) auto 18px;gap:8px;align-items:center;min-height:34px;padding:4px 8px;border-radius:6px;color:var(--ink);text-decoration:none;font-size:0.8125rem}
.rrow:hover{background:var(--subtle)}.rrow.on{background:var(--tint);box-shadow:inset 2px 0 0 var(--accent)}
.rname{line-height:1.125rem}.rc{color:var(--ink-2);font-size:0.75rem;text-align:right}
.rail-note{margin:16px 8px 4px;font-size:0.75rem;line-height:1rem;color:var(--ink-3)}
.stage{display:flex;flex-direction:column;min-width:0;background:var(--subtle)}
.well{position:relative;flex:1;min-height:0;padding:24px 40px 24px 24px;overflow:hidden;background-image:radial-gradient(var(--line) 1px,transparent 1px);background-size:16px 16px}
.frame{max-width:880px;margin:0 auto;border-radius:4px;overflow:hidden;background:#fff;box-shadow:0 0 0 1px var(--line),0 12px 28px -12px rgb(0 0 55 / .22)}
[data-theme="dark"] .frame image{filter:brightness(.9)}
.shot{display:block;width:100%;height:auto}
.mark.sel rect{}
.minimap{position:absolute;right:14px;top:24px;bottom:24px;width:10px;border-radius:5px;background:var(--track)}
.minimap .viewport{position:absolute;left:-3px;right:-3px;border:1.5px solid var(--ink-3);border-radius:4px}
.minimap .tick{position:absolute;left:0;width:10px;height:10px;transform:translateY(-50%)}.minimap .tick svg{width:10px;height:10px;display:block}
.toolrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid var(--line);background:var(--surface)}
.tgroup{display:flex;align-items:center;gap:2px}.zoom{min-width:64px;text-align:center;color:var(--ink-2)}
.legend{display:flex;gap:16px;font-size:0.75rem;color:var(--ink-2)}.legend span{display:inline-flex;align-items:center;gap:6px}
.lg{width:18px;height:10px;border-radius:2px;display:inline-block}.lg.solid{border:2px solid var(--ink-2)}.lg.dashed{border:2px dashed var(--ink-2)}
.detail{border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.dscroll{overflow:auto;flex:1}
.dhead{padding:16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.dtags{display:flex;align-items:center;gap:10px}
.dtitle{display:flex;align-items:center;gap:8px;font-size:1rem;line-height:1.5rem;font-weight:600}.dtitle .sc{font-size:0.8125rem}
.bigratio{display:flex;align-items:baseline;gap:10px;font-size:0.8125rem}.bigratio .ratio b{font-size:1.75rem;line-height:2rem;letter-spacing:-0.01em}.bigratio .ratio small{font-size:1rem}
.ruler{padding:4px 0 2px}
.rtrack{position:relative;height:6px;border-radius:3px;background:var(--track)}
.rtrack .gap{position:absolute;top:0;bottom:0;background:var(--serious);border-radius:3px;min-width:3px}
.rtrack .req{position:absolute;top:-5px;width:2px;height:16px;background:var(--ink);transform:translateX(-1px)}
.rtrack .meas{position:absolute;top:-4px;width:14px;height:14px;border-radius:50%;background:var(--surface);border:3px solid var(--serious);transform:translateX(-7px)}
.rticks{position:relative;height:18px;margin-top:6px}
.rt{position:absolute;transform:translateX(-50%);font-size:0.6875rem;color:var(--ink-3);font-variant-numeric:tabular-nums}.rt i{display:none}
.dsec{padding:14px 16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px}
.dsec-head{display:flex;justify-content:space-between;align-items:center}
.dlabel{font-size:0.75rem;font-weight:600;color:var(--ink-2);letter-spacing:.01em;margin:0}
.kv{margin:0}.kv div{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font-size:0.8125rem;align-items:center}.kv div:last-child{border-bottom:0}
.kv dt{color:var(--ink-3)}.kv dd{margin:0;display:flex;gap:8px;align-items:center;min-width:0}
.sel-text{overflow-wrap:anywhere}
.sw{width:14px;height:14px;border-radius:3px;box-shadow:inset 0 0 0 1px var(--line-strong);display:inline-block;flex:none}
.diff{border:1px solid var(--line);border-radius:6px;overflow:hidden;font-size:0.8125rem}
.dl{display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:center;padding:6px 10px 6px 0}
.dl .pm{text-align:center;font-family:var(--mono);color:var(--ink-3)}
.dl.del{background:var(--critical-bg)}.dl.add{background:var(--pass-bg)}
.dfootnote{display:flex;gap:8px;align-items:center;padding:8px 10px;border-top:1px solid var(--line);font-size:0.8125rem}
.drow{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.dfoot{padding:12px 16px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--line);gap:8px}
.pager{display:flex;align-items:center;gap:2px}.acts{display:flex;gap:8px}
@media (max-width:1280px){.work{grid-template-columns:260px minmax(0,1fr);height:auto;max-height:none}.detail{grid-column:1/-1;border-left:0;border-top:1px solid var(--line)}.sumdl{grid-template-columns:1fr 1fr}.sumdl>div:nth-child(2){border-right:0}}
@media (max-width:720px){.work{grid-template-columns:1fr}.rail{border-right:0;border-bottom:1px solid var(--line)}.sumdl{grid-template-columns:1fr}.sumdl>div{border-right:0;padding-left:0}.legend{display:none}}
"""


def render() -> str:
    content = f"""
      <div class="rhead">
        <div>
          <h1 class="t-page">marlowegreen.example</h1>
          <div class="meta"><span class="mono">/about/our-story</span><span>{icon("i-desktop")}Desktop, 1280 × 800 px</span><span>Detector and rules</span><span>Captured <time datetime="2026-10-11T21:40">12 min ago</time></span></div>
        </div>
        <div class="hacts">
          <div class="seg" role="group" aria-label="Viewport"><button aria-pressed="true">{icon("i-desktop")}Desktop</button><button aria-pressed="false">{icon("i-mobile")}Mobile</button></div>
          <button class="btn">{icon("i-export")}Export report{icon("i-down")}</button>
          <button class="btn">{icon("i-rerun")}Run again</button>
        </div>
      </div>
      <nav class="tabs viewtabs" aria-label="Report views"><a href="#" aria-current="page">Findings</a><a href="#">Table</a><a href="#">Compare with rules only</a><a href="#">Coverage</a></nav>
      {summary()}
      <div class="panel work">{rail()}{canvas()}{detail()}</div>"""
    crumbs = f'<a href="#">Audits</a>{icon("i-chevron")}<b>marlowegreen.example</b>'
    return page("Report - marlowegreen.example - WCAG Auditor", "audits", crumbs, content, CSS, wide=True)
