import time
from pathlib import Path
from typing import Any, cast

import pytest
from app.catalogue import load as load_catalogue
from app.catalogue import parse
from app.config import Settings
from app.eval_api import cells_csv, to_view
from app.main import create_app
from fastapi.testclient import TestClient
from test_runs_api import FIXTURES, REAL, wait_for_terminal

ROOT = Path(__file__).resolve().parents[3]
EVAL_FIXTURE = ROOT / "eval" / "fixtures"


def eval_client(tmp_path: Path, **over: Any) -> TestClient:
    settings = Settings(
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        folder_roots=(FIXTURES.resolve(),),
        pdf=False,
        eval_import_dirs=(EVAL_FIXTURE,),
        **over,
    )
    return TestClient(create_app(settings))


def test_the_catalogue_is_parsed_from_the_markdown_table() -> None:
    cat = load_catalogue(ROOT / "CHECK_CATALOGUE.md")
    assert [e.sc for e in cat.entries] == [
        "1.4.3",
        "1.4.11",
        "2.4.7",
        "2.4.11",
        "2.4.12",
        "2.4.13",
        "2.5.7",
        "2.5.8",
    ]
    first = cat.entries[0]
    assert first.name == "Contrast (Minimum)" and first.level == "AA"
    assert "**" not in first.detectability and first.detectability.startswith("both")
    assert cat.coverage_claim.startswith("Coverage claim")


def test_catalogue_parser_ignores_rows_that_are_not_nine_cells() -> None:
    assert parse("| SC | a |\n|---|---|\n| 1.1.1 x | y |\n").entries == []


def test_catalogue_endpoint(tmp_path: Path) -> None:
    with eval_client(tmp_path) as c:
        body = c.get("/catalogue").json()
        assert len(body["entries"]) == 8
    with eval_client(tmp_path / "x", catalogue_path=tmp_path / "missing.md") as c:
        assert c.get("/catalogue").status_code == 404


def test_the_committed_eval_fixture_is_hybrid_against_rule_only() -> None:
    import json

    view = to_view(json.loads((EVAL_FIXTURE / "metrics.json").read_text()))
    assert (view.mcnemar_a, view.mcnemar_b) == ("hybrid", "rule_only")
    assert len(view.cells) == 3 * 3 * 8 and view.meta.conditions == ["rule_only", "pixel", "hybrid"]
    real = next(
        c for c in view.cells if (c.condition, c.stratum, c.sc) == ("hybrid", "real", "1.4.3")
    )
    assert real.precision is not None and real.precision_ci is not None
    csv_text = cells_csv(view, "hybrid", "real")
    assert csv_text.splitlines()[0].startswith("sc,tp,fp,fn") and len(csv_text.splitlines()) == 9


def test_imported_evaluation_is_listed_detailed_and_exported(tmp_path: Path) -> None:
    with eval_client(tmp_path) as c:
        listing = c.get("/eval").json()
        assert (
            len(listing) == 1
            and listing[0]["source"] == "import"
            and listing[0]["status"] == "done"
        )
        detail = c.get(f"/eval/{listing[0]['id']}").json()
        assert detail["view"]["meta"]["items_scored"] > 0
        csv = c.get(
            f"/eval/{listing[0]['id']}/export.csv",
            params={"condition": "hybrid", "stratum": "real"},
        )
        assert csv.status_code == 200 and csv.headers["content-type"].startswith("text/csv")
        assert (
            c.get(
                f"/eval/{listing[0]['id']}/export.csv",
                params={"condition": "hybrid", "stratum": "x"},
            ).status_code
            == 422
        )
        tex = c.get(f"/eval/{listing[0]['id']}/export.tex")
        assert tex.status_code == 200 and "\\begin{tabular}" in tex.text
        assert c.get("/eval/999").status_code == 404
        with c.stream("GET", f"/eval/{listing[0]['id']}/events") as stream:
            assert "event: progress" in "".join(stream.iter_text())
    with eval_client(tmp_path) as c:
        assert len(c.get("/eval").json()) == 1


def test_starting_an_evaluation_needs_a_benchmark(tmp_path: Path) -> None:
    with eval_client(tmp_path) as c:
        r = c.post("/eval", json={})
        assert r.status_code == 422 and "BENCHMARK_DIR" in r.text
        assert c.post("/eval", json={"conditions": ["bogus"]}).status_code == 422


def test_an_evaluation_run_reports_progress_and_stores_metrics(tmp_path: Path) -> None:
    with eval_client(tmp_path, benchmark_dir=FIXTURES.resolve()) as c:
        created = c.post("/eval", json={"conditions": ["rule_only"], "bootstrap": 100})
        assert created.status_code == 201
        eval_id = created.json()["eval_id"]
        assert c.post("/eval", json={}).status_code == 409
        deadline = time.time() + 240
        while time.time() < deadline:
            summary = next(e for e in c.get("/eval").json() if e["id"] == eval_id)
            if summary["status"] in {"done", "failed"}:
                break
            time.sleep(1)
        assert summary["status"] == "done", summary
        view = c.get(f"/eval/{eval_id}").json()["view"]
        assert view["meta"]["items_scored"] == 12 and view["meta"]["conditions"] == ["rule_only"]
        assert view["mcnemar"] == []


def test_compare_pairs_rule_only_findings_with_their_hybrid_counterparts(tmp_path: Path) -> None:
    with eval_client(tmp_path) as c:
        run_id = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        assert wait_for_terminal(c, run_id)["status"] == "done"
        data = c.get(f"/runs/{run_id}/compare", params={"viewport": "mobile"}).json()
        hybrid_keys = {f["key"] for f in data["hybrid"]}
        assert len(data["hybrid"]) == 18 and 0 < len(data["rule_only"]) < len(data["hybrid"])
        assert data["only_rule_only"] == []
        pixel_only = {f["key"] for f in data["hybrid"] if f["provenance"] == "pixel"}
        assert set(data["only_hybrid"]) == pixel_only
        assert {p["hybrid"] for p in data["pairs"]} <= hybrid_keys
        assert all(f["id"] == 0 and f["guidance"] is None for f in data["rule_only"])
        only = c.post("/runs", json={"folder": str(REAL), "condition": "rule_only"}).json()[
            "run_id"
        ]
        assert wait_for_terminal(c, only)["status"] == "done"
        assert c.get(f"/runs/{only}/compare", params={"viewport": "mobile"}).status_code == 404


@pytest.mark.parametrize("state", ["queued", "running"])
def test_evaluations_left_unfinished_by_a_previous_process_are_failed(
    tmp_path: Path, state: str
) -> None:
    from app.models import EvalRun

    with eval_client(tmp_path) as c, cast(Any, c.app).state.sessions() as session:
        session.add(
            EvalRun(config={"status": state, "out": str(tmp_path), "conditions": []}, metrics={})
        )
        session.commit()
    with eval_client(tmp_path) as c:
        statuses = {e["status"] for e in c.get("/eval").json()}
        assert statuses == {"done", "failed"}


def test_a_second_evaluation_is_refused_while_one_is_queued_and_bad_imports_are_skipped(
    tmp_path: Path,
) -> None:
    bad = tmp_path / "bad_eval"
    bad.mkdir()
    (bad / "metrics.json").write_text('{"meta": {}}')
    settings = Settings(
        data_dir=tmp_path / "d",
        db_url=f"sqlite:///{tmp_path / 'a.db'}",
        folder_roots=(FIXTURES.resolve(),),
        pdf=False,
        benchmark_dir=FIXTURES.resolve(),
        eval_import_dirs=(bad, EVAL_FIXTURE),
    )
    with TestClient(create_app(settings)) as c:
        assert [e["source"] for e in c.get("/eval").json()] == ["import"]
        first = c.post("/eval", json={"conditions": ["rule_only", "rule_only"], "bootstrap": 100})
        assert first.status_code == 201
        assert c.post("/eval", json={}).status_code == 409
        eval_id = first.json()["eval_id"]
        deadline = time.time() + 240
        while time.time() < deadline:
            current = next(e for e in c.get("/eval").json() if e["id"] == eval_id)
            if current["status"] in {"done", "failed"}:
                break
            time.sleep(1)
        assert current["status"] == "done" and current["conditions"] == ["rule_only"]


def test_two_simultaneous_evaluation_requests_yield_exactly_one_run(tmp_path: Path) -> None:
    from concurrent.futures import ThreadPoolExecutor

    with eval_client(tmp_path, benchmark_dir=FIXTURES.resolve()) as c:
        with ThreadPoolExecutor(2) as pool:
            codes = sorted(
                f.result().status_code
                for f in [
                    pool.submit(
                        c.post, "/eval", json={"conditions": ["rule_only"], "bootstrap": 100}
                    )
                    for _ in range(2)
                ]
            )
        assert codes == [201, 409]
        eval_id = next(e["id"] for e in c.get("/eval").json() if e["source"] == "run")
        deadline = time.time() + 240
        while time.time() < deadline:
            current = next(e for e in c.get("/eval").json() if e["id"] == eval_id)
            if current["status"] in {"done", "failed"}:
                break
            time.sleep(1)
        assert current["status"] == "done"


def test_export_edge_cases_return_clean_errors(tmp_path: Path) -> None:
    from app.models import EvalRun

    with eval_client(tmp_path) as c:
        with cast(Any, c.app).state.sessions() as session:
            session.add(
                EvalRun(
                    config={"status": "running", "out": str(tmp_path / "none"), "conditions": []},
                    metrics={},
                )
            )
            session.commit()
            running_id = max(e["id"] for e in c.get("/eval").json())
        done_id = next(e["id"] for e in c.get("/eval").json() if e["source"] == "import")
        assert (
            c.get(
                f"/eval/{running_id}/export.csv", params={"condition": "hybrid", "stratum": "real"}
            ).status_code
            == 404
        )
        assert c.get(f"/eval/{running_id}/export.tex").status_code == 404
        assert (
            c.get(
                f"/eval/{done_id}/export.csv", params={"condition": "nonsense", "stratum": "real"}
            ).status_code
            == 422
        )
        assert c.get("/eval/9999/events").status_code == 404
        assert c.get(f"/eval/{running_id}").json()["view"] is None


def test_pdf_is_exported_with_its_page_count_when_enabled(tmp_path: Path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        db_url=f"sqlite:///{tmp_path / 'app.db'}",
        folder_roots=(FIXTURES.resolve(),),
        pdf=True,
    )
    with TestClient(create_app(settings)) as c:
        run_id = c.post("/runs", json={"folder": str(REAL)}).json()["run_id"]
        assert wait_for_terminal(c, run_id)["status"] == "done"
        pdf = c.get(f"/runs/{run_id}/report.pdf", params={"viewport": "mobile"})
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
        listing = {
            e["format"]: e
            for e in c.get(f"/runs/{run_id}/exports", params={"viewport": "mobile"}).json()
        }
        assert listing["pdf"]["pages"] >= 1 and listing["pdf"]["size_bytes"] > 1000


def test_restart_reconciliation_leaves_finished_evaluations_alone_and_explains_the_rest(
    tmp_path: Path,
) -> None:
    from app.models import EvalRun

    with eval_client(tmp_path) as c, cast(Any, c.app).state.sessions() as session:
        session.add(
            EvalRun(
                config={"status": "running", "out": str(tmp_path), "conditions": []}, metrics={}
            )
        )
        session.commit()
    with eval_client(tmp_path) as c:
        rows = {e["source"] + e["status"]: e for e in c.get("/eval").json()}
        assert rows["importdone"]["error"] is None
        assert "restart" in rows["runfailed"]["error"]
