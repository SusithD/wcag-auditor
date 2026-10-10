from __future__ import annotations

from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console

from auditor import pipeline
from auditor.schema import Condition

app = typer.Typer(no_args_is_help=True, help="ML-assisted WCAG 2.2 auditor")
console = Console()


@app.command()
def run(
    folder: Annotated[Path, typer.Option(help="Capture folder to replay")],
    out: Annotated[Path | None, typer.Option(help="Output directory")] = None,
    condition: Annotated[Condition, typer.Option()] = "hybrid",
) -> None:
    """Run the pipeline on a capture folder (stub: writes an empty report)."""
    if not (folder / "meta.json").is_file():
        console.print(f"error: {folder} is not a capture folder (no meta.json)")
        raise typer.Exit(code=1)
    target = out or Path("data/runs") / folder.name
    result = pipeline.run_folder(folder, target, condition)
    console.print(f"run {result.id} -> {target / 'report.json'}")


@app.command()
def capture(
    url: str,
    out: Annotated[Path, typer.Option()] = Path("data/captures"),
    viewports: Annotated[str, typer.Option()] = "desktop,mobile",
    max_focus_steps: Annotated[int, typer.Option()] = 60,
) -> None:
    """Capture a URL into benchmark-layout folders (one per viewport)."""
    from auditor.capture import VIEWPORTS, PlaywrightBrowser, capture_url

    names = [v.strip() for v in viewports.split(",") if v.strip()]
    unknown = [v for v in names if v not in VIEWPORTS]
    if unknown or not names:
        console.print(f"error: bad viewports {unknown or viewports!r}; use {sorted(VIEWPORTS)}")
        raise typer.Exit(code=1)
    with PlaywrightBrowser() as browser:
        folders = capture_url(browser, url, out, names, max_focus_steps)
    for folder in folders:
        console.print(f"captured {folder}")


@app.command()
def eval(
    benchmark: Annotated[Path, typer.Option()],
    truth: Annotated[Path, typer.Option()],
    out: Annotated[Path, typer.Option()] = Path("eval"),
) -> None:
    """Score a benchmark against ground truth (implemented in M2)."""
    console.print("eval: not implemented until M2")
    raise typer.Exit(code=2)


if __name__ == "__main__":
    app()
