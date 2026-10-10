import csv
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
from auditor.eval import stability
from auditor.eval.stability import FIELDS, compare_findings, sample_pages, summarise
from auditor.schema import BBox, Finding

FIXTURES = Path(__file__).resolve().parents[3] / "fixtures"


def f(sc: str, box: tuple[float, float, float, float] | None, focus: int | None = None) -> Finding:
    bbox = BBox(x=box[0], y=box[1], w=box[2], h=box[3]) if box else None
    return Finding(
        sc=sc, bbox=bbox, focus_index=focus, severity="minor", tier="automated",
        score=1.0, provenance="rule", evidence={}, guidance_key="k",
    )  # fmt: skip


def by_sc(a: list[Finding], b: list[Finding]) -> dict[str, Any]:
    return {x.sc: x for x in compare_findings(a, b, 0.3, 0.5)}


def test_focus_findings_match_by_stop_index_not_by_box() -> None:
    out = by_sc([f("2.4.7", (0, 0, 10, 10), 2)], [f("2.4.7", (500, 500, 10, 10), 2)])
    assert out["2.4.7"].matched == 1
    assert (
        by_sc([f("2.4.7", (0, 0, 10, 10), 2)], [f("2.4.7", (0, 0, 10, 10), 3)])["2.4.7"].matched
        == 0
    )


def test_matching_is_one_to_one() -> None:
    a = [f("1.4.3", (0, 0, 100, 20)), f("1.4.3", (2, 0, 100, 20))]
    b = [f("1.4.3", (1, 0, 100, 20))]
    ag = by_sc(a, b)["1.4.3"]
    assert (ag.matched, ag.benchmark, ag.recapture) == (1, 2, 1) and ag.dice == pytest.approx(2 / 3)


def test_a_small_box_inside_a_large_one_matches_by_containment_only() -> None:
    big, small = f("1.4.3", (0, 0, 200, 100)), f("1.4.3", (10, 10, 20, 10))
    assert by_sc([big], [small])["1.4.3"].matched == 1
    assert compare_findings([big], [f("1.4.3", (300, 300, 20, 10))], 0.3, 0.5)[0].matched == 0


def test_sampling_is_deterministic_and_never_larger_than_the_pool(tmp_path: Path) -> None:
    for i in range(15):
        (tmp_path / f"real_x_{i:03d}_desktop_t").mkdir()
    (tmp_path / "real_x_999_desktop_file").write_text("not a folder")
    (tmp_path / "real_x_001_mobile_t").mkdir()
    first = sample_pages(tmp_path, 10, 7)
    assert first == sample_pages(tmp_path, 10, 7) and len(first) == 10
    assert first != sample_pages(tmp_path, 10, 8)
    assert len(sample_pages(tmp_path, 40, 7)) == 15
    assert all(p.is_dir() and "desktop" in p.name for p in first)


def test_empty_rows_summarise_to_none_and_write_a_fixed_header() -> None:
    s = summarise([], [], 3, 1)
    assert s["overall_dice"] is None and s["pages_compared"] == 0 and s["per_sc"] == {}
    assert "n/a" in stability.markdown(s)


def test_run_stability_offline_records_comparisons_and_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bench = tmp_path / "bench"
    bench.mkdir()
    sources = sorted(FIXTURES.glob("real/real_com_*_desktop_*"))[:1]
    assert sources
    shutil.copytree(sources[0], bench / sources[0].name)
    bad = bench / "real_zzz_001_desktop_20260101T000000Z"
    shutil.copytree(sources[0], bad)

    class FakeBrowser:
        versions = {"browser": "chromium fake"}

        def __enter__(self) -> "FakeBrowser":
            return self

        def __exit__(self, *exc: object) -> None:
            return None

    def fake_capture(
        _b: Any, url: str, out: Path, vps: list[str], _n: int, page_id: int, errors: list[str]
    ) -> list[Path]:
        out.mkdir(parents=True, exist_ok=True)
        dest = out / f"copy_{page_id}"
        shutil.copytree(sources[0], dest)
        meta = json.loads((dest / "meta.json").read_text())
        meta["http_status"] = 503 if page_id == 2 else 200
        (dest / "meta.json").write_text(json.dumps(meta))
        return [dest]

    import auditor.capture as capture_pkg

    monkeypatch.setattr(capture_pkg, "PlaywrightBrowser", FakeBrowser)
    monkeypatch.setattr(capture_pkg, "capture_url", fake_capture)
    summary = stability.run_stability(bench, tmp_path / "out", n=2, seed=1)
    assert summary["pages_compared"] == 1 and len(summary["pages_failed"]) == 1
    assert "HTTP 503" in summary["pages_failed"][0]["error"]
    assert summary["reproducible"] is False and summary["versions"]["protocol_sha"]
    rows = list(csv.DictReader((tmp_path / "out" / "stability.csv").open()))
    assert list(rows[0]) == FIELDS and all(float(r["dice"] or 1) == 1.0 for r in rows)
    assert (tmp_path / "out" / "stability.md").read_text().startswith("# Re-capture stability")
