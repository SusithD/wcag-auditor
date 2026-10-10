import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts"))
EVAL = ROOT / "eval" / "2026-10-10"


def test_figures_are_written_and_byte_identical_across_runs(tmp_path: Path) -> None:
    import eval_figure  # type: ignore[import-not-found]

    outputs = []
    for run in ("a", "b"):
        d = tmp_path / run
        d.mkdir()
        for name in ("metrics.json", "sensitivity.csv"):
            shutil.copy(EVAL / name, d / name)
        files = [*eval_figure.sensitivity(d), *eval_figure.per_sc(d)]
        assert all(f.stat().st_size > 1000 for f in files)
        outputs.append({f.name: f.read_bytes() for f in files})
    assert outputs[0] == outputs[1]
    assert max(len(b) for b in outputs[0].values()) < 200_000


def test_failure_taxonomy_counts_match_the_committed_failures(tmp_path: Path) -> None:
    import csv

    import failure_taxonomy  # type: ignore[import-not-found]

    shutil.copy(EVAL / "failures.csv", tmp_path / "failures.csv")
    text = failure_taxonomy.main(tmp_path).read_text()
    rows = failure_taxonomy.load(tmp_path)
    real_hybrid_fn_143 = sum(
        1
        for r in rows
        if (r["condition"], r["stratum"], r["sc"], r["type"]) == ("hybrid", "real", "1.4.3", "FN")
    )
    assert "| 1.4.3 | " in text and real_hybrid_fn_143 > 0
    with (tmp_path / "failures.csv").open() as fh:
        assert {"page_features", "type", "stratum"} <= set(csv.DictReader(fh).fieldnames or [])
    assert "### hybrid: real-stratum failures by page feature" in text
