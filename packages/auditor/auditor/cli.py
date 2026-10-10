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
    folder: Annotated[Path | None, typer.Option(help="Capture folder to replay")] = None,
    screenshots: Annotated[
        list[Path] | None, typer.Option(help="Screenshot-only mode: one or more PNG files")
    ] = None,
    out: Annotated[Path | None, typer.Option(help="Output directory")] = None,
    condition: Annotated[Condition, typer.Option()] = "hybrid",
) -> None:
    """Run the pipeline on a capture folder, or on screenshots alone."""
    if screenshots:
        missing = [p for p in screenshots if not p.is_file()]
        if folder is not None or missing:
            console.print("error: give either --folder or existing --screenshots files")
            raise typer.Exit(code=1)
        target = out or Path("data/runs") / screenshots[0].stem
        shot_run = pipeline.run_screenshots(screenshots, target, condition)
        console.print(f"run {shot_run.id} -> {target / 'report.json'}")
        return
    if folder is None or not (folder / "meta.json").is_file():
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
    max_focus_steps: Annotated[int, typer.Option()] = 15,
) -> None:
    """Capture a URL into benchmark-layout folders (one per viewport)."""
    from auditor.capture import VIEWPORTS, PlaywrightBrowser, capture_url

    if max_focus_steps < 1:
        console.print("error: --max-focus-steps must be at least 1")
        raise typer.Exit(code=1)

    names = [v.strip() for v in viewports.split(",") if v.strip()]
    unknown = [v for v in names if v not in VIEWPORTS]
    if unknown or not names:
        console.print(f"error: bad viewports {unknown or viewports!r}; use {sorted(VIEWPORTS)}")
        raise typer.Exit(code=1)
    errors: list[str] = []
    with PlaywrightBrowser() as browser:
        folders = capture_url(browser, url, out, names, max_focus_steps, errors=errors)
    for folder in folders:
        console.print(f"captured {folder}")
    for err in errors:
        console.print(f"failed {err}")
    if errors:
        raise typer.Exit(code=1)


def _fmt(v: float | None) -> str:
    return "n/a" if v is None else f"{v:.3f}"


@app.command()
def eval(
    benchmark: Annotated[Path, typer.Option(help="Folder tree of capture folders")],
    truth: Annotated[Path | None, typer.Option(help="benchmark_ground_truth.json")] = None,
    out: Annotated[Path, typer.Option()] = Path("eval"),
    conditions: Annotated[str, typer.Option()] = "rule_only",
    seed: Annotated[int, typer.Option()] = 20261004,
    bootstrap: Annotated[int, typer.Option()] = 10000,
    rule_findings: Annotated[
        Path | None, typer.Option(help="Precomputed baseline_runs/<id> directory")
    ] = None,
    include_needs_review: Annotated[bool, typer.Option()] = False,
    elements: Annotated[str, typer.Option(help="auto | dom | detector")] = "auto",
    synthetic_truth: Annotated[str, typer.Option(help="from-folders")] = "from-folders",
) -> None:
    """Score captures against ground truth (real: --truth file or per-folder truth.json;
    synthetic: each folder's truth.json)."""
    from auditor.eval.harness import EvalConfig, run_eval
    from auditor.eval.units import SCS

    if synthetic_truth != "from-folders":
        console.print("error: --synthetic-truth must be 'from-folders'")
        raise typer.Exit(code=1)
    cfg = EvalConfig(
        benchmark=benchmark,
        out=out,
        truth=truth,
        conditions=[c.strip() for c in conditions.split(",") if c.strip()],
        seed=seed,
        bootstrap=bootstrap,
        rule_findings=rule_findings,
        include_needs_review=include_needs_review,
        elements=elements,
    )
    try:
        metrics = run_eval(cfg)
    except (NotImplementedError, FileNotFoundError, ValueError) as exc:
        console.print(f"error: {exc}")
        raise typer.Exit(code=2) from exc
    meta = metrics["meta"]
    console.print(
        f"scored {meta['items_scored']} items ({meta['items_unlabelled']} without truth), "
        f"seed {meta['seed']}, {meta['bootstrap_resamples']} resamples"
    )
    from rich.table import Table

    for cond, strata in metrics["metrics"].items():
        for stratum, cells in strata.items():
            table = Table(title=f"{cond} / {stratum}")
            for col in ("SC", "TP", "FP", "FN", "Dup", "P", "R", "F1"):
                table.add_column(col)
            for sc in SCS:
                if sc in cells:
                    c = cells[sc]
                    f = _fmt
                    table.add_row(
                        sc,
                        str(c["tp"]),
                        str(c["fp"]),
                        str(c["fn"]),
                        str(c["duplicates"]),
                        f(c["precision"]),
                        f(c["recall"]),
                        f(c["f1"]),
                    )
            console.print(table)
    console.print(f"wrote {out / 'metrics.json'}")


@app.command()
def ablate(
    benchmark: Annotated[Path, typer.Option(help="Folder tree of capture folders")],
    truth: Annotated[Path | None, typer.Option(help="benchmark_ground_truth.json")] = None,
    out: Annotated[Path, typer.Option()] = Path("eval"),
    seed: Annotated[int, typer.Option()] = 20261004,
    bootstrap: Annotated[int, typer.Option()] = 1000,
) -> None:
    """Run the pixel condition with DOM boxes and with detector boxes and write ablation.md."""
    from auditor.eval import ablation
    from auditor.eval.harness import EvalConfig, run_eval

    for mode in ("dom", "detector"):
        run_eval(
            EvalConfig(
                benchmark=benchmark,
                out=out / mode,
                truth=truth,
                conditions=["pixel"],
                seed=seed,
                bootstrap=bootstrap,
                elements=mode,
            )
        )
    console.print(f"wrote {ablation.write(out / 'dom', out / 'detector', out)}")


if __name__ == "__main__":
    app()
