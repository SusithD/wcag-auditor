from build import icon, page, sc, shape

CSS = """
.hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
.hd .meta { margin: 4px 0 0; color: var(--ink-2); }
.statusbar { margin-bottom: 24px; display: flex; flex-direction: column; gap: 12px; }
.statusbar p { margin: 0; font-weight: 500; font-size: 1rem; line-height: 1.5rem; }
.cols { display: grid; grid-template-columns: 280px minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.steps { list-style: none; margin: 0; padding: 8px 16px 16px; position: relative; }
.steps li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 12px; align-items: center; min-height: 40px; position: relative; color: var(--ink-3); }
.steps li svg { width: 12px; height: 12px; position: relative; z-index: 1; background: var(--surface); }
.steps li::before { content: ""; position: absolute; left: 5.5px; top: -20px; height: 40px; width: 1px; background: var(--line); }
.steps li:first-child::before { display: none; }
.steps .done { color: var(--ink); }
.steps .done svg { color: var(--ink-2); }
.steps .cur { color: var(--ink); font-weight: 600; }
.steps .cur svg { color: var(--accent); }
.steps .pend .dot { width: 8px; height: 8px; margin-left: 2px; border-radius: 50%; border: 1px solid var(--line-strong); background: var(--surface); position: relative; z-index: 1; }
.steps .t { font-size: 0.8125rem; color: var(--ink-3); font-weight: 400; font-variant-numeric: tabular-nums; }
.well { background: var(--subtle); border: 1px solid var(--line); border-radius: var(--r-md); padding: 16px 16px 0; height: 400px; overflow: hidden; }
.frame { background: var(--surface); border: 1px solid var(--line); border-bottom: 0; border-radius: var(--r-md) var(--r-md) 0 0; height: 100%; overflow: hidden; }
.frame img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: top; }
.caption { margin: 12px 0 0; font-size: 0.8125rem; color: var(--ink-3); }
.found { display: flex; flex-direction: column; }
.found .row { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 8px; align-items: baseline; min-height: 36px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.found .row:last-of-type { border-bottom: 0; }
.found .row .n { font-weight: 600; text-align: right; }
.found .row.zero .n { color: var(--ink-3); font-weight: 400; }
.cov { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); display: flex; flex-direction: column; gap: 8px; }
.cov .top { display: flex; justify-content: space-between; font-weight: 500; }
.alert { margin-top: 24px; display: flex; gap: 12px; align-items: center; padding: 12px 16px; border: 1px solid var(--line); border-left: 3px solid var(--critical); border-radius: var(--r-lg); background: var(--surface); flex-wrap: wrap; }
.alert > svg { width: 16px; height: 16px; color: var(--critical); flex: none; }
.alert p { margin: 0; flex: 1 1 320px; }
.alert p b { font-weight: 600; }
.alert .acts { display: flex; gap: 8px; align-items: center; }
.leave { margin: 16px 0 0; color: var(--ink-3); font-size: 0.8125rem; }
@media (max-width: 1100px) {
  .cols { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .cols > .preview { grid-column: 1 / -1; grid-row: 1; }
}
@media (max-width: 720px) {
  .cols { grid-template-columns: minmax(0, 1fr); }
  .well { height: 320px; padding: 12px 12px 0; }
  .alert { align-items: flex-start; }
  .alert .acts { margin-left: 28px; }
}
"""

STEPS = [
    ("Queued", "0:01"), ("Capture desktop", "0:14"), ("Capture mobile", "0:12"), ("Browser rules", "0:09"),
    ("Find elements", "0:22"), ("Check 8 criteria", None), ("Combine results", None), ("Write report", None), ("Done", None),
]
FOUND = [
    ("1.4.3", "Contrast (Minimum)", 4),
    ("1.4.11", "Non-text Contrast", 2),
    ("2.5.8", "Target Size (Minimum)", 1),
    ("2.5.7", "Dragging Movements", 0),
]


def render() -> str:
    cur = 5
    items = []
    for i, (name, t) in enumerate(STEPS):
        if i < cur:
            items.append(f'<li class="done"><svg aria-hidden="true" focusable="false" class="s-done"><use href="#sh-done"/></svg><span>{name}<span class="sr">, done</span></span><span class="t">{t}</span></li>')
        elif i == cur:
            items.append(f'<li class="cur" aria-current="step"><svg aria-hidden="true" focusable="false" class="s-running"><use href="#sh-running"/></svg><span>{name}</span><span class="t">In progress</span></li>')
        else:
            items.append(f'<li class="pend"><span class="dot" aria-hidden="true"></span><span>{name}<span class="sr">, waiting</span></span><span></span></li>')
    rows = "".join(
        f'<div class="row{" zero" if n == 0 else ""}">{sc(c)}<span>{name}</span><span class="n num">{n}</span></div>' for c, name, n in FOUND
    )
    meter9 = "".join('<i class="on"></i>' if i < 5 else ('<i class="on" style="opacity:.55"></i>' if i == 5 else "<i></i>") for i in range(9))
    meter8 = "".join('<i class="on"></i>' if i < 4 else "<i></i>" for i in range(8))
    content = f"""
<div class="hd">
  <div>
    <h1 class="t-page">marlowegreen.example</h1>
    <p class="meta">/about/our-story · Desktop and mobile · Detector and rules · Started <span class="num">14:31</span></p>
  </div>
  <button class="btn" type="button">Cancel audit</button>
</div>

<section class="statusbar" aria-label="Audit progress">
  <p role="status">Checking the eight criteria on desktop. Step <span class="num">6</span> of <span class="num">9</span>.</p>
  <div class="meter" role="img" aria-label="Step 6 of 9, 5 steps done">{meter9}</div>
</section>

<div class="cols">
  <section class="panel" aria-labelledby="steps-h">
    <div class="panel-head"><h2 class="t-section" id="steps-h">Steps</h2></div>
    <ol class="steps">{"".join(items)}</ol>
  </section>

  <section class="panel preview" aria-labelledby="prev-h">
    <div class="panel-head"><h2 class="t-section" id="prev-h">Live preview</h2></div>
    <div class="panel-body">
      <div class="well"><div class="frame"><img src="assets/page.webp" alt="Desktop capture of marlowegreen.example"></div></div>
      <p class="caption">Desktop <span class="num">1280 × 800</span> px, captured <span class="num">14:31</span></p>
    </div>
  </section>

  <section class="panel" aria-labelledby="found-h">
    <div class="panel-head"><h2 class="t-section" id="found-h">Found so far</h2><span class="t-faint num">7 failures</span></div>
    <div class="panel-body found">
      {rows}
      <div class="cov">
        <div class="top"><span>Criteria checked</span><span class="num">4 of 8</span></div>
        <div class="meter" role="img" aria-label="4 of 8 criteria checked">{meter8}</div>
        <p class="t-muted t-dense" style="margin:0">Still running: focus checks ({sc("2.4.7")}, {sc("2.4.11")}, {sc("2.4.12")}, {sc("2.4.13")})</p>
      </div>
    </div>
  </section>
</div>

<div class="alert" role="alert">
  <svg aria-hidden="true" focusable="false"><use href="#sh-alert"/></svg>
  <p><b>Mobile capture failed.</b> The page did not finish loading in <span class="num">30</span> s. Desktop results will be available.</p>
  <div class="acts"><button class="btn" type="button">{icon("i-rerun")}Retry mobile</button><a class="quiet" href="#">Details</a></div>
</div>
<p class="leave">You can leave this page. The audit keeps running.</p>"""
    crumbs = f'<a href="#">Audits</a>{icon("i-chevron")}<b aria-current="page">marlowegreen.example</b>'
    return page("Auditing marlowegreen.example - WCAG Auditor", "audits", crumbs, content, CSS, wide=True)
