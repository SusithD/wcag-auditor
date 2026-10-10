import os
from pathlib import Path

import pytest
from auditor.eval.harness import EvalConfig, run_eval

BENCH = Path(
    os.environ.get(
        "BENCHMARK_DIR",
        Path(__file__).resolve().parents[3].parent / "04_Data_Collection" / "benchmark_captures",
    )
)
SC_FLOOR = 0.90


@pytest.mark.browser
def test_all_modules_meet_the_floor_on_the_synthetic_desktop_corpus(tmp_path: Path) -> None:
    if not BENCH.is_dir():
        if os.environ.get("REQUIRE_BENCHMARK") == "1":
            pytest.fail("benchmark captures not available")
        pytest.skip("benchmark captures not available")
    metrics = run_eval(EvalConfig(benchmark=BENCH, out=tmp_path, conditions=["pixel"], bootstrap=0))
    synthetic = metrics["metrics"]["pixel"]["synthetic"]
    for sc, positives in {
        "1.4.3": 15,
        "1.4.11": 20,
        "2.4.7": 7,
        "2.4.11": 15,
        "2.4.12": 30,
        "2.4.13": 8,
        "2.5.7": 5,
        "2.5.8": 52,
    }.items():
        cell = synthetic[sc]
        assert (cell["tp"], cell["fn"]) == (positives, 0)
        assert cell["recall"] >= SC_FLOOR and cell["precision"] >= SC_FLOOR
        assert cell["fp"] == 0
