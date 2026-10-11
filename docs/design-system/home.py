from build import icon, page, sev, shape, status

SITES = [
    ("marlowegreen.example", "/about/our-story", ["Desktop", "Mobile"], "12 min ago", "11 Oct 2026, 21:40", (0, 2, 4), -3, 2, 6, ("done", "Complete")),
    ("kettleandcrumb.example", "/recipes", ["Desktop", "Mobile"], "48 min ago", "11 Oct 2026, 21:04", (1, 3, 4), 0, 9, 6, ("done", "Complete")),
    ("fernlea-health.example", "/appointments", ["Desktop"], "Now", "11 Oct 2026, 21:52", None, None, None, None, ("running", "Running: step 6 of 9")),
    ("wobblewheel.example", "/book", ["Desktop", "Mobile"], "2 hours ago", "11 Oct 2026, 19:50", (2, 4, 0), 2, 12, 5, ("done", "Complete")),
    ("saltmarsh-courier.example", "/letters", ["Desktop", "Mobile"], "10 Oct", "10 Oct 2026, 16:12", (0, 1, 5), -1, 4, 7, ("done", "Complete")),
    ("thistlebank.example", "/classes", ["Mobile"], "10 Oct", "10 Oct 2026, 11:03", None, None, None, None, ("failed", "Could not run: timed out")),
]


def meter(on: int, rev: int = 0, und: int = 0, total: int = 8, label: str = "") -> str:
    cells = ["on"] * on + ["rev"] * rev + ["und"] * und + [""] * (total - on - rev - und)
    inner = "".join(f'<i class="{c}"></i>' if c else "<i></i>" for c in cells)
    return f'<span class="meter" role="img" aria-label="{label}">{inner}</span>'


def continue_row() -> str:
    reasons = [("Text size and weight unknown", 118), ("Box estimated by the detector", 74), ("Icon colour estimated from pixels", 46)]
    rlist = "".join(f'<li><span>{r}</span><span class="num t-faint">{n}</span></li>' for r, n in reasons)
    return f"""
<section aria-labelledby="cont-h">
  <h2 id="cont-h" class="t-eyebrow" style="margin-bottom:8px">Continue</h2>
  <div class="cards3">
    <article class="panel card">
      <div class="card-top">{status("running", "Running", True)}<span class="t-faint t-dense num">2:41</span></div>
      <h3 class="card-title">fernlea-health.example</h3>
      <p class="card-text">Checking the eight criteria on desktop. Step 6 of 9.</p>
      {meter(5, label="Step 6 of 9", total=9)}
      <a class="quiet card-cta" href="#">View progress{icon("i-arrow")}</a>
    </article>
    <article class="panel card">
      <div class="card-top">{status("done", "Fixes to verify", True)}<span class="t-faint t-dense">3 sites</span></div>
      <h3 class="card-title"><span class="num">9</span> findings marked as fixed</h3>
      <p class="card-text">A fix counts once a new audit no longer finds the issue. Run the audits again to confirm.</p>
      <div style="margin-top:auto"><button class="btn">{icon("i-rerun")}Run 3 audits again</button></div>
    </article>
    <article class="panel card">
      <div class="card-top">{status("review", "Review queue", True)}<span class="t-faint t-dense">Oldest waiting 3 days</span></div>
      <h3 class="card-title"><span class="num">312</span> findings need a person</h3>
      <ul class="reasons">{rlist}</ul>
      <a class="quiet card-cta" href="#">Open queue{icon("i-arrow")}</a>
    </article>
  </div>
</section>"""


def sites_table() -> str:
    rows = []
    for site, path, vps, when, iso, counts, delta, review, decided, (st, label) in SITES:
        vp = "".join(icon("i-desktop" if v == "Desktop" else "i-mobile") for v in vps)
        if counts:
            c, s, m = counts
            total = c + s + m
            if delta is None or delta == 0:
                d = '<span class="t-faint">No change</span>'
            elif delta < 0:
                d = f'<span class="t-muted">{abs(delta)} fewer</span>'
            else:
                d = f'<span class="t-muted">{delta} more</span>'
            fails = f'<div class="fcell"><span class="num" style="font-weight:600">{total}</span>{sev(c, s, m)}</div><div class="t-faint" style="font-size:0.75rem">{d} since last audit</div>'
            rev = f'<span class="num">{review}</span>'
            dec = f'<div class="deccell"><span class="num">{decided}</span><span class="t-faint">of 8</span>{meter(decided, label=f"{decided} of 8 criteria decided")}</div>'
        else:
            fails = '<span class="t-faint">No report yet</span>' if st == "running" else '<span class="t-faint">No report: the audit did not finish</span>'
            rev = '<span class="t-faint" aria-label="none">–</span>'
            dec = '<span class="t-faint" aria-label="none">–</span>'
        rows.append(f"""
<tr>
  <td><div class="sitecell"><span class="site-dot" aria-hidden="true">{site[0].upper()}</span><div><a class="rowlink" href="#">{site}</a><small>{path}<span class="vp" aria-hidden="true">{vp}</span><span class="sr">, {' and '.join(vps)}</span></small></div></div></td>
  <td>{fails}</td>
  <td class="r">{rev}</td>
  <td>{dec}</td>
  <td><div>{status(st, label)}</div><div class="t-faint" style="font-size:0.75rem;margin-top:2px;padding-left:18px"><time datetime="{iso}" title="{iso}">{when}</time></div></td>
</tr>""")
    return f"""
<section class="panel" aria-labelledby="sites-h">
  <div class="panel-head">
    <h2 id="sites-h" class="t-section">Sites</h2>
    <div style="display:flex;align-items:center;gap:12px"><div class="seg sm" role="group" aria-label="Show sites"><button aria-pressed="true">All</button><button aria-pressed="false">With failures</button><button aria-pressed="false">Running</button></div><a class="quiet" href="#">All audits{icon("i-arrow")}</a></div>
  </div>
  <table class="data">
    <caption class="sr">Sites and their latest audit</caption>
    <thead><tr><th scope="col">Site</th><th scope="col">Failures</th><th scope="col" class="r">To review</th><th scope="col">Criteria decided</th><th scope="col">Latest audit</th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table>
</section>"""


def side() -> str:
    week = [("Audits run", "6", "2 more than last week"), ("Fixes verified", "14", "on 4 sites"), ("Review decisions", "37", "by 1 person"), ("Criteria decided", "6 of 8", "median per audit")]
    dl = "".join(f'<div><dt>{k}</dt><dd><span class="num big">{v}</span><span class="t-faint">{n}</span></dd></div>' for k, v, n in week)
    return f"""
<div class="stack">
  <section class="panel" aria-labelledby="week-h">
    <div class="panel-head"><h2 id="week-h" class="t-section">This week</h2><span class="t-faint t-dense">5 to 11 Oct</span></div>
    <dl class="weekdl">{dl}</dl>
  </section>
  <section class="panel" aria-labelledby="lim-h">
    <div class="panel-head"><h2 id="lim-h" class="t-section">Method and limits</h2><a class="quiet" href="#">Read the method{icon("i-arrow")}</a></div>
    <ul class="limits">
      <li>{shape("undecided")}<span>The tool checks <b>8 of the 86</b> WCAG 2.2 success criteria. A result is not a conformance claim.</span></li>
      <li>{shape("review")}<span>Findings that depend on the element detector are marked <b>Needs review</b>. Detector accuracy is <span class="num">0.239</span> mAP on the WebUI validation set.</span></li>
      <li>{shape("done")}<span>A fix is verified only when a new audit no longer finds the issue.</span></li>
    </ul>
  </section>
</div>"""


CSS = """
.cards3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.card{padding:16px;display:flex;flex-direction:column;gap:8px;min-height:184px}
.card-top{display:flex;justify-content:space-between;align-items:center}
.card-title{font-size:1rem;line-height:1.5rem;font-weight:600}
.card-text{margin:0;color:var(--ink-2);font-size:0.8125rem;line-height:1.25rem}
.card-cta{margin-top:auto;align-self:flex-start;margin-left:-8px}
.reasons{list-style:none;margin:0;padding:0;font-size:0.8125rem}
.reasons li{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--line);color:var(--ink-2)}
.reasons li:last-child{border-bottom:0}
.vp{display:inline-flex;gap:4px;color:var(--ink-3);vertical-align:-2px;margin-left:8px}.vp svg{width:13px;height:13px}
.fcell{display:flex;align-items:center;gap:12px}
.deccell{display:grid;grid-template-columns:auto auto 64px;gap:6px;align-items:center;white-space:nowrap}
.weekdl{margin:0;display:grid;grid-template-columns:1fr 1fr}
.weekdl div{padding:12px 16px;border-bottom:1px solid var(--line)}
.weekdl div:nth-child(odd){border-right:1px solid var(--line)}
.weekdl div:nth-last-child(-n+2){border-bottom:0}
.weekdl dt{font-size:0.75rem;font-weight:500;color:var(--ink-3)}
.weekdl dd{margin:4px 0 0;display:flex;flex-direction:column;gap:2px;font-size:0.75rem}
.big{font-size:1.25rem;line-height:1.75rem;font-weight:600;color:var(--ink)}
.limits{list-style:none;margin:0;padding:8px 16px 12px}
.limits li{display:grid;grid-template-columns:16px 1fr;gap:10px;padding:8px 0;font-size:0.8125rem;color:var(--ink-2);border-bottom:1px solid var(--line)}
.limits li:last-child{border-bottom:0}.limits svg{width:12px;height:12px;margin-top:4px;color:var(--ink-3)}.limits b{color:var(--ink);font-weight:600}
.main-grid{margin-top:24px;grid-template-columns:minmax(0,1fr) 340px}
.sitecell a{white-space:nowrap}
table.data td{vertical-align:middle}
@media (max-width:1100px){.cards3{grid-template-columns:1fr 1fr}.cards3 .card:last-child{grid-column:1/-1}}
@media (max-width:720px){.cards3{grid-template-columns:1fr}
 table.data thead{display:none}table.data,table.data tbody,table.data tr,table.data td{display:block}
 table.data tr{border-bottom:1px solid var(--line);padding:8px 0}table.data td{border:0;height:auto;padding:4px 16px}table.data td.r{text-align:left}}
"""


def render() -> str:
    content = f"""
      <div class="page-head">
        <div><h1 class="t-page">Overview</h1><p>One audit is running and 312 findings are waiting for review.</p></div>
        <span class="scope">8 of 86 WCAG 2.2 criteria checked. Not a conformance claim.</span>
      </div>
      {continue_row()}
      <div class="grid-2 main-grid">{sites_table()}{side()}</div>"""
    return page("Overview - WCAG Auditor", "overview", "<b>Overview</b>", content, CSS)
