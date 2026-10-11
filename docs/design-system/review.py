from build import icon, page, shape, sc

CSS = """
.rq-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.rq-head p{margin:4px 0 0;color:var(--ink-2)}
.rq-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.rq-tools .btn svg:last-child{width:14px;height:14px;color:var(--ink-3)}
.rq-tools .fl{color:var(--ink-3);font-weight:400}
.rq-tools .vs{width:1px;height:20px;background:var(--line);margin:0 4px}
.rq{display:grid;grid-template-columns:440px minmax(0,1fr);height:max(560px,calc(100vh - 56px - 24px - 72px - 16px - 120px));overflow:hidden}
.rq-left{border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0;min-width:0}
.rq-list{flex:1;overflow:auto;min-height:0}
.grp{border-bottom:1px solid var(--line)}
.grp-head{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 16px;background:var(--subtle);position:sticky;top:0;z-index:1;border-bottom:1px solid var(--line)}
.grp-head h2{font-size:0.8125rem;line-height:1.125rem;font-weight:600;flex:1;min-width:0}
.grp-head h2 span{color:var(--ink-3);font-weight:500;margin-left:4px}
.grp.closed .grp-head{border-bottom:0}
.grp-head .chev{width:14px;height:14px;color:var(--ink-3);flex:none}
.grp.closed .chev{transform:rotate(-90deg)}
.items{list-style:none;margin:0;padding:0}
.it{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);position:relative;min-height:56px}
.items li:last-child .it{border-bottom:0}
.it:hover{background:var(--subtle)}
.it.on{background:var(--tint)}
.it.on::before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:var(--accent)}
.chk{appearance:none;-webkit-appearance:none;width:16px;height:16px;margin:2px 0 0;border:1px solid var(--line-strong);border-radius:4px;background:var(--surface);flex:none;display:grid;place-items:center;position:relative;cursor:pointer}
.chk::after{content:"";width:8px;height:4px;border-left:2px solid var(--on-accent);border-bottom:2px solid var(--on-accent);transform:rotate(-45deg) translate(1px,-1px);opacity:0}
.chk:checked{background:var(--accent-fill);border-color:var(--accent-fill)}
.chk:checked::after{opacity:1}
.chk::before{content:"";position:absolute;inset:-6px}
.it-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;color:inherit;text-decoration:none}
.it-main a{color:inherit;text-decoration:none}
.it-main a::after{content:"";position:absolute;inset:0;left:40px}
.it-main a:focus-visible{outline:none}
.it-main a:focus-visible::after{outline:2px solid var(--ring);outline-offset:-2px}
.it-top{display:flex;align-items:baseline;gap:8px}
.it-name{font-weight:500;color:var(--ink);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.it.on .it-name{font-weight:600}
.it-sub{font-size:0.8125rem;color:var(--ink-3)}
.it-age{margin-left:auto;font-size:0.75rem;color:var(--ink-3);white-space:nowrap;padding-left:8px}
.bulk{flex:none;border-top:1px solid var(--line);background:var(--surface);display:flex;align-items:center;gap:8px;padding:12px 16px}
.bulk b{font-weight:600;margin-right:auto}
.bulk .quiet{margin-right:0}
button.quiet{border:0;background:transparent;font-family:var(--font);cursor:pointer}
.rq-right{display:flex;flex-direction:column;min-height:0;min-width:0}
.rq-scroll{flex:1;overflow:auto;padding:24px 32px;min-height:0}
.rq-scroll>*{max-width:640px}
.ctx{font-size:0.8125rem;color:var(--ink-3);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ctx b{color:var(--ink);font-weight:500}
.ctx i{width:3px;height:3px;border-radius:50%;background:var(--line-strong);display:inline-block}
.ttl{display:flex;align-items:center;gap:12px;margin:8px 0 12px}
.ttl h2{font-size:1.25rem;line-height:1.75rem;font-weight:600;letter-spacing:-0.01em}
.reason{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px}
.reason p{margin:0;color:var(--ink);padding-top:1px}
.crop{position:relative;width:100%;max-width:560px;height:152px;border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;background:#fff}
.crop img{position:absolute;left:-84px;top:-638px;width:1280px;height:1300px;max-width:none}
.crop .box{position:absolute;left:20px;top:12px;width:520px;height:128px;border:2px dashed var(--navy);border-radius:2px;box-shadow:0 0 0 2px #fff}
.cap{font-size:0.75rem;color:var(--ink-3);margin-top:6px}
.sec{margin-top:20px}
.sec>h3{font-size:0.8125rem;font-weight:600;color:var(--ink);margin-bottom:8px}
dl.ev{margin:0;display:grid;grid-template-columns:152px minmax(0,1fr);border-top:1px solid var(--line)}
dl.ev dt,dl.ev dd{margin:0;min-height:32px;display:flex;align-items:center;border-bottom:1px solid var(--line);padding:6px 0}
dl.ev dt{color:var(--ink-3);font-size:0.8125rem}
dl.ev dd{gap:8px;flex-wrap:wrap}
.settle{display:flex;gap:12px;padding:12px;border:1px solid var(--line);border-radius:var(--r-md);background:var(--subtle);align-items:flex-start}
.settle svg{width:14px;height:14px;color:var(--ink-3);flex:none;margin-top:3px}
.settle p{margin:0}
.settle b{font-weight:600}
.opts{display:grid;gap:8px;border:0;margin:0;padding:0}
.opts legend{padding:0;font-size:1rem;line-height:1.5rem;font-weight:600;margin-bottom:8px}
.opt{display:flex;gap:12px;align-items:flex-start;padding:12px;border:1px solid var(--line-control);border-radius:var(--r-lg);background:var(--surface);cursor:pointer;position:relative;min-height:48px}
.opt:hover{background:var(--subtle)}
.opt input{appearance:none;-webkit-appearance:none;width:16px;height:16px;border:1px solid var(--line-strong);border-radius:50%;margin:2px 0 0;flex:none;background:var(--surface)}
.opt input:checked{border:5px solid var(--accent-fill);background:var(--surface)}
.opt:has(input:checked){border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);background:var(--tint)}
.opt:has(input:focus-visible){outline:2px solid var(--ring);outline-offset:2px}
.opt .t{font-weight:600;display:block}
.opt .d{color:var(--ink-3);font-size:0.8125rem;display:block}
.opt .kbd{margin-left:auto;align-self:center}
.opt>span:not(.kbd){flex:1;min-width:0}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.chips .lbl{width:100%;font-size:0.75rem;color:var(--ink-3);font-weight:500}
.chip{min-height:28px;padding:0 12px;border:1px solid var(--line-control);border-radius:999px;background:var(--surface);color:var(--ink-2);font:500 0.8125rem var(--font);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.chip svg{width:12px;height:12px}
.chip[aria-pressed="true"]{border-color:var(--accent);background:var(--tint);color:var(--ink);box-shadow:0 0 0 1px var(--accent)}
.note{display:flex;flex-direction:column;gap:6px;margin-top:16px}
.note label{font-size:0.8125rem;font-weight:500}
.note label span{color:var(--ink-3);font-weight:400}
.note textarea{min-height:72px;padding:8px 12px;resize:vertical;font:400 0.875rem/1.25rem var(--font)}
.foot{flex:none;border-top:1px solid var(--line);padding:12px 32px;display:flex;align-items:center;gap:16px;background:var(--surface)}
.foot .keys{display:flex;gap:16px;align-items:center;color:var(--ink-3);font-size:0.8125rem;margin-right:auto;flex-wrap:wrap}
.foot .keys span{display:inline-flex;gap:4px;align-items:center}
.recent{margin-top:24px}
.recent h2{margin-bottom:8px}
.rrows{list-style:none;margin:0;padding:0}
.rrows li{display:flex;align-items:center;gap:16px;min-height:48px;padding:0 16px;border-bottom:1px solid var(--line)}
.rrows li:last-child{border-bottom:0}
.rrows .w{width:120px;white-space:nowrap;flex:none;font-weight:600;display:inline-flex;gap:6px;align-items:center}
.rrows .w svg{width:12px;height:12px}
.rrows .nm{font-weight:500}
.rrows .by{margin-left:auto;color:var(--ink-3);font-size:0.8125rem}
.rrows .quiet{margin-right:-8px}
@media (max-width:1100px){.rq{grid-template-columns:360px minmax(0,1fr)}}
@media (max-width:900px){.rq{grid-template-columns:minmax(0,1fr);height:auto;overflow:visible}.rq-left{max-height:480px;border-right:0;border-bottom:1px solid var(--line)}.rq-scroll,.foot{padding-left:16px;padding-right:16px}}
"""


def filt(label: str, value: str) -> str:
    return f'<button class="btn btn-sm" aria-haspopup="listbox" aria-expanded="false"><span class="fl">{label}</span>{value}{icon("i-down")}</button>'


def item(code: str, name: str, site: str, age: str, checked: bool = False, on: bool = False) -> str:
    cur = ' aria-current="true"' if on else ""
    return (
        f'<li><div class="it{" on" if on else ""}">'
        f'<input class="chk" type="checkbox" aria-label="Select {code} {name}, {site}"{" checked" if checked else ""}>'
        f'<div class="it-main"><div class="it-top">{sc(code)}<a href="#"{cur} class="it-name">{name}</a><span class="it-age num">{age}</span></div>'
        f'<span class="it-sub">{site}</span></div></div></li>'
    )


def group(title: str, n: int, items: str = "") -> str:
    closed = "" if items else " closed"
    return (
        f'<section class="grp{closed}" aria-label="{title}"><div class="grp-head">'
        f'<svg class="chev" aria-hidden="true"><use href="#i-down"/></svg>'
        f'<h2>{title}<span class="num">{n}</span></h2>'
        f'<a class="quiet" href="#" aria-label="Select all in group {title}">Select all in group</a></div>'
        + (f'<ul class="items">{items}</ul>' if items else "")
        + "</section>"
    )


def render() -> str:
    first = "".join(
        [
            item("1.4.3", "Contrast (Minimum)", "marlowegreen.example", "12 min", checked=True, on=True),
            item("1.4.3", "Contrast (Minimum)", "kettleandcrumb.example", "26 min", checked=True),
            item("1.4.11", "Non-text Contrast", "fernlea-health.example", "41 min"),
            item("1.4.3", "Contrast (Minimum)", "marlowegreen.example", "1 h"),
        ]
    )
    groups = (
        group("Text size and weight unknown", 118, first)
        + group("Box estimated by the detector", 74)
        + group("Icon colour estimated from pixels", 46)
        + group("Focus frames did not settle", 41)
        + group("Target size from a detector box", 33)
    )

    left = f"""
<div class="rq-left">
  <div class="rq-list" role="region" aria-label="Waiting findings, grouped by reason" tabindex="0">{groups}</div>
  <div class="bulk" role="region" aria-label="Bulk actions"><b class="num" aria-live="polite">2 selected</b>
    <button class="btn btn-sm">Confirm</button><button class="btn btn-sm">Not an issue…</button><button class="quiet">Clear</button></div>
</div>"""

    def ev(k: str, v: str) -> str:
        return f"<dt>{k}</dt><dd>{v}</dd>"

    right = f"""
<section class="rq-right" aria-labelledby="det-h">
  <div class="rq-scroll" tabindex="0" role="region" aria-label="Finding detail">
    <div class="ctx"><b>marlowegreen.example</b><span class="mono">/about</span><i></i><span>{icon("i-desktop").replace("<svg", '<svg style="width:14px;height:14px;vertical-align:-3px;margin-right:4px"')}Desktop, 1280 × 800</span></div>
    <div class="ttl"><h2 id="det-h"><span class="sc" style="font-size:inherit;color:var(--ink-3)">1.4.3</span> Contrast (Minimum)</h2><span class="level">AA</span></div>
    <div class="reason"><span class="tag tag-review">{shape("review")}Needs review</span>
      <p>Text size and weight are unknown, so it is not settled whether the 3:1 or the 4.5:1 threshold applies.</p></div>
    <div class="crop" role="img" aria-label="Crop of the paragraph under Our story, grey text on white, outlined by the finding box">
      <img src="assets/page.webp" alt=""><div class="box"></div></div>
    <div class="cap">Element crop, 2×</div>
    <div class="sec"><h3>Evidence</h3>
      <dl class="ev">
        {ev("Measured", '<span class="ratio num"><b>3.8</b><small>:1</small></span>')}
        {ev("If large text", '<span class="status s-pass">' + shape("pass") + "passes 3:1</span>")}
        {ev("If normal text", '<span class="status s-critical">' + shape("critical") + "fails 4.5:1</span>")}
        {ev("Element", '<span class="mono">section#story &gt; p.story</span>')}
        {ev("Source", '<a class="link" href="#">Open in report' + icon("i-ext") + "</a>")}
      </dl></div>
    <div class="sec"><div class="settle">{icon("i-help")}<p><b>What would settle it.</b> Check the computed font size and weight of <span class="mono">p.story</span>.</p></div></div>
    <fieldset class="opts sec"><legend>Your decision</legend>
      <label class="opt"><input type="radio" name="d"><span><span class="t">Confirm issue</span><span class="d">The finding is a real failure of the criterion.</span></span><span class="kbd">C</span></label>
      <div><label class="opt"><input type="radio" name="d" checked><span><span class="t">Not an issue</span><span class="d">The tool was wrong or the criterion does not apply.</span></span><span class="kbd">X</span></label>
        <div class="chips" role="group" aria-label="Reason"><span class="lbl">Reason</span>
          <button class="chip" aria-pressed="true">{icon("i-check")}Large text</button><button class="chip" aria-pressed="false">Decorative</button><button class="chip" aria-pressed="false">Tool error</button><button class="chip" aria-pressed="false">Other</button></div></div>
      <label class="opt"><input type="radio" name="d"><span><span class="t">Cannot tell, keep in queue</span><span class="d">Leave it waiting for someone else to check.</span></span><span class="kbd">?</span></label>
    </fieldset>
    <div class="note field"><label for="note">Note <span>(optional)</span></label>
      <textarea id="note" class="input" placeholder="Computed font size was 19.2px at weight 400"></textarea></div>
  </div>
  <div class="foot"><div class="keys"><span><span class="kbd">J</span><span class="kbd">K</span> move</span><span><span class="kbd">C</span><span class="kbd">X</span><span class="kbd">?</span> decide</span></div>
    <button class="btn btn-primary">Save and next</button></div>
</section>"""

    def done(word: str, code: str, name: str, site: str, shp: str) -> str:
        return (
            f'<li><span class="w">{shape(shp)}{word}</span><span>{sc(code)} <span class="nm">{name}</span></span>'
            f'<span class="t-faint">{site}</span><span class="by">Decided by SA, 11 Oct 14:32</span><button class="quiet">Undo</button></li>'
        )

    recent = f"""
<section class="recent" aria-labelledby="rec-h"><h2 class="t-section" id="rec-h">Recently decided</h2>
  <div class="panel"><ul class="rrows">
    {done("Confirmed", "1.4.11", "Non-text Contrast", "fernlea-health.example", "critical")}
    {done("Not an issue", "2.5.8", "Target Size (Minimum)", "kettleandcrumb.example", "pass")}
  </ul></div></section>"""

    head = f"""
<div class="rq-head">
  <div><h1 class="t-page">Review queue</h1><p>Findings the tool could not decide. A person needs to check each one.</p></div>
  <div class="rq-tools" role="group" aria-label="Filters">
    {filt("Site", "All")}{filt("Criterion", "All")}{filt("Reason", "All")}<span class="vs"></span>
    <div class="seg" role="group" aria-label="Status"><button aria-pressed="true">Waiting <span class="num">312</span></button><button aria-pressed="false">Decided</button><button aria-pressed="false">All</button></div>
  </div>
</div>"""

    content = head + f'<div class="panel rq">{left}{right}</div>' + recent
    return page("Review queue - WCAG Auditor", "review", "<b>Review queue</b>", content, CSS, wide=True)
