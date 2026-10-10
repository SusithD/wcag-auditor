from __future__ import annotations

from collections.abc import Callable
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
def audit(
    out: Annotated[Path, typer.Option(help="Run directory")],
    url: Annotated[str | None, typer.Option()] = None,
    folder: Annotated[list[Path] | None, typer.Option(help="Capture folder (repeatable)")] = None,
    viewports: Annotated[str, typer.Option()] = "desktop,mobile",
    condition: Annotated[Condition, typer.Option()] = "hybrid",
    max_focus_steps: Annotated[int, typer.Option()] = 15,
    pdf: Annotated[bool, typer.Option("--pdf/--no-pdf")] = True,
) -> None:
    """Capture a URL or replay folders, run each viewport; writes events.jsonl, summary.json."""
    from auditor.audit import audit as run_audit

    if (url is None) == (not folder):
        console.print("error: pass either --url or one or more --folder")
        raise typer.Exit(code=1)
    names = [v.strip() for v in viewports.split(",") if v.strip()]
    code = run_audit(
        out,
        url=url,
        folders=folder or [],
        viewports=names,
        condition=condition,
        max_focus_steps=max_focus_steps,
        pdf=pdf,
    )
    raise typer.Exit(code=code)


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


@app.command()
def stability(
    benchmark: Annotated[Path, typer.Option(help="Folder tree of benchmark capture folders")],
    out: Annotated[Path, typer.Option()],
    sample: Annotated[int, typer.Option()] = 10,
    seed: Annotated[int, typer.Option()] = 20261004,
) -> None:
    """Re-capture a sample of real pages live and compare findings with the benchmark capture."""
    from auditor.eval.stability import run_stability

    summary = run_stability(benchmark, out, sample, seed)
    console.print(
        f"compared {summary['pages_compared']} pages, overall Dice {summary['overall_dice']}, "
        f"{len(summary['pages_failed'])} failed -> {out / 'stability.md'}"
    )


def _progress_writer(path: Path | None) -> Callable[[int, int], None] | None:
    if path is None:
        return None
    path.parent.mkdir(parents=True, exist_ok=True)

    def write(done: int, total: int) -> None:
        import json

        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({"done": done, "total": total}) + "\n")

    return write


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
    synthetic_truth: Annotated[str, typer.Option(help="from-folders")] = "from-folders",
    progress_file: Annotated[
        Path | None, typer.Option(help="Write {done,total} JSON lines here")
    ] = None,
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
    )
    try:
        metrics = run_eval(cfg, _progress_writer(progress_file))
    except NotImplementedError as exc:
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


if __name__ == "__main__":
    app()
