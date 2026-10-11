from pathlib import Path

HERE = Path(__file__).parent
SPRITE = (HERE / "sprite.svg").read_text()

LEVEL_WORD = {
    "critical": "Critical",
    "serious": "Serious",
    "minor": "Minor",
    "review": "Needs review",
    "pass": "No issue found",
    "undecided": "Could not decide",
}


def icon(name: str, cls: str = "") -> str:
    c = f' class="{cls}"' if cls else ""
    return f'<svg{c} aria-hidden="true" focusable="false"><use href="#{name}"/></svg>'


def shape(level: str) -> str:
    return f'<svg aria-hidden="true" focusable="false"><use href="#sh-{level}"/></svg>'


def status(level: str, label: str, strong: bool = False) -> str:
    return f'<span class="status s-{level}{" strong" if strong else ""}">{shape(level)}{label}</span>'


def sc(code: str) -> str:
    return '<span class="sc">' + '<span class="d">.</span>'.join(code.split(".")) + "</span>"


def ratio(value: str) -> str:
    return f'<span class="ratio num"><b>{value}</b><small>:1</small></span>'


def sev(c: int, s: int, m: int) -> str:
    def one(level: str, n: int) -> str:
        z = " zero" if n == 0 else ""
        return f'<span class="status s-{level}{z}">{shape(level)}<span class="num">{n}</span><span class="sr"> {level},</span></span>'

    return f'<span class="sev">{one("critical", c)}{one("serious", s)}{one("minor", m)}</span>'


def sidebar(active: str) -> str:
    def item(key: str, label: str, ic: str, count: str = "", sr_count: str = "") -> str:
        cur = ' aria-current="page"' if key == active else ""
        c = f'<span class="count" aria-hidden="true">{count}</span><span class="sr">, {sr_count}</span>' if count else ""
        return f'<a href="#"{cur} title="{label}">{icon(ic)}<span class="lbl">{label}</span>{c}</a>'

    recents = "".join(
        f'<a href="#" title="{s}"><span class="site-dot" aria-hidden="true">{s[0].upper()}</span><span class="lbl">{s}</span></a>'
        for s in ["marlowegreen.example", "kettleandcrumb.example", "fernlea-health.example"]
    )
    return f"""
<div class="side">
  <div class="brand"><span class="mark">{icon("i-logo")}</span><span class="word">WCAG Auditor</span></div>
  <div class="side-body">
    <a class="btn btn-primary btn-block" href="#" title="New audit">{icon("i-plus")}<span class="lbl">New audit</span></a>
    <nav class="nav" aria-label="Main">
      {item("overview", "Overview", "i-overview")}
      {item("audits", "Audits", "i-audits")}
      {item("review", "Review queue", "i-review", "312", "312 waiting")}
      {item("sites", "Sites", "i-sites")}
      <div class="nav-title" aria-hidden="true">Research</div>
      {item("eval", "Evaluation", "i-eval")}
      {item("study", "Study", "i-study")}
    </nav>
    <nav class="nav recent" aria-label="Recent sites"><div class="nav-title">Recent sites</div>{recents}</nav>
    <nav class="nav" aria-label="Settings and help" style="margin-top:auto">
      {item("settings", "Settings", "i-settings")}
      {item("help", "Help and method", "i-help")}
    </nav>
  </div>
  <div class="side-foot"><span class="avatar" aria-hidden="true">SA</span><div class="who"><div style="font-weight:500">Susith Alwis</div><div class="t-faint" style="font-size:0.75rem">Researcher</div></div></div>
</div>"""


def topbar(crumbs: str, actions: str = "") -> str:
    return f"""
<header class="topbar">
  <div class="mobilebar"><button class="btn btn-ghost btn-icon" aria-label="Open menu" aria-expanded="false">{icon("i-menu")}</button><span class="mark">{icon("i-logo")}</span></div>
  <nav class="crumbs" aria-label="Breadcrumb">{crumbs}</nav>
  <div style="flex:1"></div>
  {actions}
  <button class="searchbtn" aria-haspopup="dialog" aria-label="Search">{icon("i-search")}<span>Search</span><span class="kbds" aria-hidden="true"><span class="kbd">⌘</span><span class="kbd">K</span></span></button>
  <button class="btn btn-ghost btn-icon toggle-theme" aria-label="Dark theme" aria-pressed="false" onclick="toggleTheme()">{icon("i-moon", "moon")}{icon("i-sun", "sun")}</button>
</header>"""


def page(title: str, active: str, crumbs: str, content: str, css: str = "", wide: bool = False) -> str:
    style = ' style="max-width:none"' if wide else ""
    return f"""<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="tokens.css">
<style>{css}</style>
</head>
<body>
{SPRITE}
<a class="skip" href="#main">Skip to content</a>
<div class="app">
  {sidebar(active)}
  <div class="main">
    {topbar(crumbs)}
    <main id="main" class="content"{style} tabindex="-1">
{content}
    </main>
  </div>
</div>
<script>
function toggleTheme(){{const d=document.documentElement;const dark=d.dataset.theme!=="dark";d.dataset.theme=dark?"dark":"light";document.querySelectorAll(".toggle-theme").forEach(x=>x.setAttribute("aria-pressed",String(dark)));}}
if(location.hash==="#dark"){{toggleTheme();}}
</script>
</body>
</html>
"""


PAGES = ["home", "report", "system", "new_audit", "progress", "review", "evaluation", "first_run"]


def build() -> None:
    import importlib

    for name in PAGES:
        out = "index" if name == "system" else name.replace("_", "-")
        try:
            mod = importlib.import_module(name)
            html = mod.render()
        except ModuleNotFoundError:
            continue
        except Exception as exc:
            print("skipped", name, type(exc).__name__, exc)
            continue
        (HERE / f"{out}.html").write_text(html)
        print("wrote", out)


if __name__ == "__main__":
    build()
