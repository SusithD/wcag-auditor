from build import icon, page, sev

CSS = """
.compose { max-width: 760px; }
.compose .page-head { align-items: flex-start; margin-bottom: 16px; }
.compose .tabs { margin-bottom: 16px; }
.form { display: flex; flex-direction: column; }
.group { padding: 24px; display: flex; flex-direction: column; gap: 12px; border-bottom: 1px solid var(--line); border-top: 0; margin: 0; min-width: 0; }
.group:first-child { border-radius: var(--r-lg) var(--r-lg) 0 0; }
.cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.card { position: relative; display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border: 1px solid var(--line-control); border-radius: var(--r-md); background: var(--surface); cursor: pointer; min-height: 64px; }
.card:hover { background: var(--subtle); }
.card input { position: absolute; opacity: 0; width: 100%; height: 100%; inset: 0; margin: 0; cursor: pointer; }
.card .mk { width: 20px; height: 20px; flex: none; margin-top: 1px; border: 1px solid var(--line-strong); background: var(--surface); display: grid; place-items: center; color: var(--on-accent); }
.card.box .mk { border-radius: 4px; }
.card.radio .mk { border-radius: 50%; }
.card .mk svg { width: 12px; height: 12px; opacity: 0; }
.card.radio .mk::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--on-accent); opacity: 0; }
.card:has(input:checked) { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--tint); }
.card:has(input:checked) .mk { background: var(--accent-fill); border-color: var(--accent-fill); }
.card:has(input:checked) .mk svg, .card:has(input:checked) .mk::after { opacity: 1; }
.card:has(input:focus-visible) { outline: 2px solid var(--ring); outline-offset: 2px; }
.card .ct { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.card .cn { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.card .cn svg { width: 16px; height: 16px; color: var(--ink-2); }
.card .cd { color: var(--ink-2); font-size: 0.8125rem; }
.adv { padding: 0; border-bottom: 1px solid var(--line); }
.adv summary { list-style: none; display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 24px; cursor: pointer; font-weight: 600; }
.adv summary::-webkit-details-marker { display: none; }
.adv summary svg { width: 14px; height: 14px; color: var(--ink-3); transition: none; }
.adv[open] summary svg { transform: rotate(180deg); }
.adv summary:hover { background: var(--subtle); }
.adv summary:focus-visible { outline-offset: -2px; }
.adv-body { padding: 8px 24px 24px; display: flex; flex-direction: column; gap: 16px; }
.row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
select.input { appearance: none; background: var(--surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2362657c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center; padding-right: 32px; }
.chk { display: flex; gap: 12px; align-items: flex-start; }
.chk input { width: 16px; height: 16px; margin: 2px 0 0; flex: none; accent-color: var(--accent-fill); }
.chk label { font-weight: 500; display: block; }
.chk .hint { display: block; font-weight: 400; margin-top: 2px; }
.chk .meta { display: inline-flex; align-items: center; gap: 6px; }
.num-in { max-width: 120px; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 24px; flex-wrap: wrap; }
.foot .acts { display: flex; gap: 8px; }
.recent-h { margin: 32px 0 8px; display: flex; align-items: baseline; justify-content: space-between; }
.recent-list { list-style: none; margin: 0; padding: 0; }
.recent-list li { display: grid; grid-template-columns: minmax(0, 1fr) 128px auto 96px; align-items: center; gap: 16px; min-height: 48px; padding: 8px 16px; border-bottom: 1px solid var(--line); }
.recent-list li:last-child { border-bottom: 0; }
.recent-list .addr { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recent-list .addr small { display: block; font-weight: 400; color: var(--ink-3); font-size: 0.75rem; }
.recent-list .act { justify-self: end; }
.compose .scope { margin-top: 24px; }
@media (max-width: 720px) {
  .cards, .row2 { grid-template-columns: minmax(0, 1fr); }
  .group, .adv-body, .foot { padding-left: 16px; padding-right: 16px; }
  .adv summary { padding: 0 16px; }
  .group { padding-top: 16px; padding-bottom: 16px; }
  .foot { flex-direction: column; align-items: stretch; }
  .foot .acts { justify-content: flex-end; }
  .recent-list li { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; }
  .recent-list .when { grid-column: 1; grid-row: 2; }
  .recent-list .fails { grid-column: 2; grid-row: 1; }
  .recent-list .act { grid-column: 2; grid-row: 2; }
}
"""


def card(kind: str, name: str, value: str, title: str, desc: str, checked: bool, ic: str = "") -> str:
    chk = " checked" if checked else ""
    mark = icon("i-check") if kind == "box" else ""
    ico = icon(ic) if ic else ""
    t = "checkbox" if kind == "box" else "radio"
    return f"""<label class="card {kind}"><input type="{t}" name="{name}" value="{value}"{chk}><span class="mk" aria-hidden="true">{mark}</span><span class="ct"><span class="cn">{ico}{title}</span><span class="cd">{desc}</span></span></label>"""


RECENT = [
    ("marlowegreen.example", "/about/our-story", "11 Oct", (0, 6, 2)),
    ("kettleandcrumb.example", "/recipes", "11 Oct", (1, 3, 4)),
    ("fernlea-health.example", "/appointments", "9 Oct", (0, 2, 1)),
]


def render() -> str:
    recent = "".join(
        f"""<li><span class="addr">{a}<small>{p}</small></span><span class="when t-faint num">{d}</span><span class="fails">{sev(*s)}</span><span class="act"><a class="quiet" href="#" aria-label="Run again for {a}">{icon("i-rerun")}Run again</a></span></li>"""
        for a, p, d, s in RECENT
    )
    content = f"""
<div class="compose">
  <div class="page-head"><div>
    <h1 class="t-page">New audit</h1>
    <p>We open the page in Chromium, capture it at the sizes you choose, and check 8 WCAG 2.2 criteria.</p>
  </div></div>
  <nav class="tabs" aria-label="Audit source">
    <a href="#" aria-current="page">Web address</a>
    <a href="#">Screenshots</a>
  </nav>

  <form class="panel form" action="#" onsubmit="return false">
    <div class="group">
      <div class="field">
        <label for="url">Web address</label>
        <input class="input" id="url" name="url" type="url" placeholder="https://example.com" autocomplete="url" aria-describedby="url-hint" inputmode="url">
        <span class="hint" id="url-hint">The page must be publicly reachable.</span>
      </div>
    </div>

    <div class="group" role="group" aria-labelledby="vp-l">
      <div class="flabel" id="vp-l">Viewports</div>
      <div class="cards">
        {card("box", "viewport", "desktop", "Desktop", '<span class="num">1280 × 800 px</span>', True, "i-desktop")}
        {card("box", "viewport", "mobile", "Mobile", '<span class="num">390 × 844 px</span>', True, "i-mobile")}
      </div>
    </div>

    <div class="group" role="radiogroup" aria-labelledby="me-l">
      <div class="flabel" id="me-l">Method</div>
      <div class="cards">
        {card("radio", "method", "hybrid", "Detector and rules", "Rules plus the element detector; some findings need review", True)}
        {card("radio", "method", "rules", "Rules only", "Browser rules only; fewer criteria can be decided", False)}
      </div>
    </div>

    <details class="adv" open>
      <summary>Advanced{icon("i-down")}</summary>
      <div class="adv-body">
        <div class="row2">
          <div class="field">
            <label for="wait">Wait for</label>
            <select class="input" id="wait" name="wait"><option>Page load</option><option>Network idle</option></select>
          </div>
          <div class="field">
            <label for="focus">Focus steps</label>
            <input class="input num num-in" id="focus" name="focus" type="number" min="1" max="60" value="15" aria-describedby="focus-hint">
            <span class="hint" id="focus-hint">How many Tab presses to record</span>
          </div>
        </div>
        <div class="chk">
          <input type="checkbox" id="cookies" name="cookies" checked aria-describedby="cookies-hint">
          <div><label for="cookies">Dismiss cookie banners</label><span class="hint" id="cookies-hint">A banner left open changes contrast results</span></div>
        </div>
        <div class="chk">
          <input type="checkbox" id="compare" name="compare" checked aria-describedby="compare-hint">
          <div><label for="compare">Compare with the previous audit of this address</label><span class="hint" id="compare-hint">Last audit 11 Oct, <span class="num">6</span> failures</span></div>
        </div>
      </div>
    </details>

    <div class="foot">
      <span class="t-faint">Takes about 1 to 2 minutes.</span>
      <div class="acts">
        <button type="button" class="btn btn-lg">Cancel</button>
        <button type="submit" class="btn btn-primary btn-lg">Run audit<span class="kbd" aria-hidden="true">⌘↵</span></button>
      </div>
    </div>
  </form>

  <section aria-labelledby="recent-h">
    <div class="recent-h"><h2 class="t-section" id="recent-h">Recent addresses</h2><a class="link" href="#">All audits</a></div>
    <div class="panel"><ul class="recent-list">{recent}</ul></div>
  </section>

  <p class="scope">This tool checks 8 of the 86 WCAG 2.2 success criteria. Results are not a conformance claim.</p>
</div>"""
    crumbs = f'<a href="#">Overview</a>{icon("i-chevron")}<b aria-current="page">New audit</b>'
    return page("New audit - WCAG Auditor", "overview", crumbs, content, CSS)
