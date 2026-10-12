from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import threading
from collections.abc import Iterator
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from app import hfsync
from app.hfsync import HfConfig, Manifest

TOKEN = "hf_supersecret_token_value"


class FakeApi:
    def __init__(self) -> None:
        self.commits: list[Any] = []
        self.created: list[dict[str, Any]] = []
        self.squashes = 0
        self.snapshot: Path | None = None
        self.fail: Exception | None = None
        self.model_info: Any = SimpleNamespace(lfs=None, blob_id=None)
        self.model_bytes = b"onnx-bytes"
        self.downloads = 0

    def create_repo(self, repo: str, **kwargs: Any) -> None:
        self.created.append({"repo": repo, **kwargs})

    def create_commit(self, repo: str, operations: list[Any], **kwargs: Any) -> None:
        if self.fail:
            raise self.fail
        self.commits.append((repo, list(operations), kwargs))

    def super_squash_history(self, repo: str, **kwargs: Any) -> None:
        self.squashes += 1

    def snapshot_download(self, repo: str, *, local_dir: Path, **kwargs: Any) -> str:
        if self.snapshot:
            shutil.copytree(self.snapshot, local_dir, dirs_exist_ok=True)
        return str(local_dir)

    def get_paths_info(self, repo: str, paths: list[str], **kwargs: Any) -> list[Any]:
        return [self.model_info]

    def hf_hub_download(self, repo: str, filename: str, *, local_dir: str, **kwargs: Any) -> str:
        self.downloads += 1
        out = Path(local_dir) / filename
        out.write_bytes(self.model_bytes)
        return str(out)


def cfg_for(tmp_path: Path, **over: Any) -> HfConfig:
    base: dict[str, Any] = {
        "data_dir": tmp_path,
        "token": TOKEN,
        "dataset_repo": "u/data",
        "model_repo": "u/model",
        "model_file": "detector.onnx",
        "interval_s": 10.0,
        "squash_every": 100,
    }
    base.update(over)
    return HfConfig(**base)


def make_db(path: Path, rows: int = 3) -> None:
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)")
    conn.executemany("INSERT INTO t (v) VALUES (?)", [("x",)] * rows)
    conn.commit()
    conn.close()


def added_paths(commit: Any) -> set[str]:
    return {op.path_in_repo for op in commit[1] if type(op).__name__ == "CommitOperationAdd"}


def test_restore_into_empty_dir(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    (remote / "runs" / "r1").mkdir(parents=True)
    (remote / "runs" / "r1" / "report.json").write_text("{}")
    make_db(remote / "app.db")
    (remote / "sync_meta.json").write_text(json.dumps({"db_pushed_at": 1000.0}))
    data = tmp_path / "data"
    api = FakeApi()
    api.snapshot = remote
    msg = hfsync.restore(cfg_for(data), api)  # type: ignore[arg-type]
    assert "restored app.db" in msg
    assert (data / "runs" / "r1" / "report.json").read_text() == "{}"
    assert sqlite3.connect(data / "app.db").execute("select count(*) from t").fetchone() == (3,)
    assert api.created[0]["private"] is True
    assert api.created[0]["repo_type"] == "dataset"
    assert not [p for p in data.iterdir() if p.name.startswith(".hfsync-restore-")]
    assert "runs/r1/report.json" in Manifest.load(data).files


def test_restore_empty_remote(tmp_path: Path) -> None:
    api = FakeApi()
    msg = hfsync.restore(cfg_for(tmp_path / "data"), api)  # type: ignore[arg-type]
    assert "restored 0 files" in msg
    assert not (tmp_path / "data" / "app.db").exists()


def test_restore_keeps_newer_local_db(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    remote.mkdir()
    make_db(remote / "app.db", rows=1)
    (remote / "sync_meta.json").write_text(json.dumps({"db_pushed_at": 1000.0}))
    data = tmp_path / "data"
    data.mkdir()
    make_db(data / "app.db", rows=7)
    api = FakeApi()
    api.snapshot = remote
    msg = hfsync.restore(cfg_for(data), api)  # type: ignore[arg-type]
    assert "kept newer local app.db" in msg
    assert sqlite3.connect(data / "app.db").execute("select count(*) from t").fetchone() == (7,)


def test_restore_replaces_older_local_db(tmp_path: Path) -> None:
    remote = tmp_path / "remote"
    remote.mkdir()
    make_db(remote / "app.db", rows=1)
    (remote / "sync_meta.json").write_text(json.dumps({"db_pushed_at": 4_000_000_000.0}))
    data = tmp_path / "data"
    data.mkdir()
    make_db(data / "app.db", rows=7)
    api = FakeApi()
    api.snapshot = remote
    hfsync.restore(cfg_for(data), api)  # type: ignore[arg-type]
    assert sqlite3.connect(data / "app.db").execute("select count(*) from t").fetchone() == (1,)


def test_backup_is_consistent_while_writing(tmp_path: Path) -> None:
    db = tmp_path / "app.db"
    make_db(db, rows=10)
    stop = threading.Event()

    def writer() -> None:
        conn = sqlite3.connect(db, timeout=30)
        while not stop.is_set():
            with conn:
                conn.execute("INSERT INTO t (v) VALUES ('w')")
        conn.close()

    thread = threading.Thread(target=writer)
    thread.start()
    try:
        for i in range(5):
            out = tmp_path / f"copy{i}.db"
            hfsync.backup_sqlite(db, out)
            check = sqlite3.connect(out)
            assert check.execute("pragma integrity_check").fetchone() == ("ok",)
            assert check.execute("select count(*) from t").fetchone()[0] >= 10
            check.close()
    finally:
        stop.set()
        thread.join()


def test_push_incremental(tmp_path: Path) -> None:
    make_db(tmp_path / "app.db")
    runs = tmp_path / "runs"
    (runs / "a").mkdir(parents=True)
    (runs / "a" / "one.json").write_text("1")
    (runs / "a" / "two.json").write_text("2")
    (runs / "a" / "skip.tmp").write_text("x")
    (tmp_path / "browser-profile").mkdir()
    (tmp_path / "browser-profile" / "Cookies").write_text("c")
    api = FakeApi()
    cfg = cfg_for(tmp_path)
    hfsync.push(cfg, api)  # type: ignore[arg-type]
    assert len(api.commits) == 1
    assert added_paths(api.commits[0]) == {
        "app.db",
        "runs/a/one.json",
        "runs/a/two.json",
        "sync_meta.json",
    }
    assert api.commits[0][2]["commit_message"].startswith("sync ")

    (runs / "a" / "two.json").write_text("22")
    (runs / "a" / "three.json").write_text("3")
    (runs / "a" / "one.json").unlink()
    hfsync.push(cfg, api)  # type: ignore[arg-type]
    assert len(api.commits) == 2
    second = api.commits[1]
    assert added_paths(second) == {"runs/a/two.json", "runs/a/three.json", "sync_meta.json"}
    deletes = [op.path_in_repo for op in second[1] if type(op).__name__ == "CommitOperationDelete"]
    assert deletes == ["runs/a/one.json"]


def test_push_nothing_changed_makes_no_commit(tmp_path: Path) -> None:
    make_db(tmp_path / "app.db")
    (tmp_path / "runs").mkdir()
    (tmp_path / "runs" / "f").write_text("1")
    api = FakeApi()
    cfg = cfg_for(tmp_path)
    hfsync.push(cfg, api)  # type: ignore[arg-type]
    created_before = len(api.created)
    assert hfsync.push(cfg, api) == "nothing changed"  # type: ignore[arg-type]
    assert len(api.commits) == 1
    assert len(api.created) == created_before


def test_failed_commit_does_not_advance_manifest(tmp_path: Path) -> None:
    (tmp_path / "runs").mkdir()
    (tmp_path / "runs" / "f").write_text("1")
    api = FakeApi()
    api.fail = RuntimeError("boom")
    cfg = cfg_for(tmp_path)
    with pytest.raises(RuntimeError):
        hfsync.push(cfg, api)  # type: ignore[arg-type]
    api.fail = None
    hfsync.push(cfg, api)  # type: ignore[arg-type]
    assert "runs/f" in added_paths(api.commits[0])


def test_squash_every_n_pushes(tmp_path: Path) -> None:
    (tmp_path / "runs").mkdir()
    api = FakeApi()
    cfg = cfg_for(tmp_path, squash_every=2)
    for i in range(4):
        (tmp_path / "runs" / f"f{i}").write_text(str(i))
        hfsync.push(cfg, api)  # type: ignore[arg-type]
    assert api.squashes == 2


def test_loop_backoff_and_recovery(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    results: list[object] = [RuntimeError("a"), RuntimeError("b"), RuntimeError("c"), "ok", "ok"]

    def fake_push(cfg: HfConfig, api: object) -> str:
        item = results.pop(0)
        if isinstance(item, Exception):
            raise item
        return str(item)

    monkeypatch.setattr(hfsync, "push", fake_push)
    delays: list[float] = []
    hfsync.loop(
        cfg_for(tmp_path, interval_s=10),
        FakeApi(),  # type: ignore[arg-type]
        sleep=delays.append,
        max_iterations=5,
    )
    assert delays == [10, 20, 40, 10, 10]


def test_loop_survives_busy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    def busy(cfg: HfConfig, api: object) -> str:
        raise hfsync.SyncBusyError("busy")

    monkeypatch.setattr(hfsync, "push", busy)
    delays: list[float] = []
    hfsync.loop(cfg_for(tmp_path), FakeApi(), sleep=delays.append, max_iterations=2)  # type: ignore[arg-type]
    assert delays == [10, 10]


def test_lock_prevents_overlapping_push(tmp_path: Path) -> None:
    api = FakeApi()
    with hfsync.sync_lock(tmp_path), pytest.raises(hfsync.SyncBusyError):
        hfsync.push(cfg_for(tmp_path), api)  # type: ignore[arg-type]
    assert api.commits == []
    (tmp_path / "runs").mkdir()
    (tmp_path / "runs" / "f").write_text("1")
    hfsync.push(cfg_for(tmp_path), api)  # type: ignore[arg-type]
    assert len(api.commits) == 1


def test_model_downloads_then_skips_when_sha_matches(tmp_path: Path) -> None:
    api = FakeApi()
    sha = hashlib.sha256(api.model_bytes).hexdigest()
    api.model_info = SimpleNamespace(lfs=SimpleNamespace(sha256=sha), blob_id=None)
    cfg = cfg_for(tmp_path)
    assert "downloaded" in hfsync.fetch_model(cfg, api)  # type: ignore[arg-type]
    dest = tmp_path / "models" / "detector.onnx"
    assert dest.read_bytes() == api.model_bytes
    assert hfsync.fetch_model(cfg, api) == "model up to date"  # type: ignore[arg-type]
    assert api.downloads == 1
    api.model_info = SimpleNamespace(lfs=SimpleNamespace(sha256="0" * 64), blob_id=None)
    api.model_bytes = b"new"
    hfsync.fetch_model(cfg, api)  # type: ignore[arg-type]
    assert dest.read_bytes() == b"new"
    assert not [p for p in dest.parent.iterdir() if p.name.startswith(".hfsync-model-")]


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
    values = {"DATA_DIR": str(tmp_path), "HF_TOKEN": TOKEN, "HF_DATASET_REPO": "u/data"}
    yield values


def test_cli_unconfigured_exits_zero(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert hfsync.main(["push"], env={"DATA_DIR": str(tmp_path)}) == 0
    assert hfsync.main(["model"], env={"DATA_DIR": str(tmp_path)}) == 0
    assert "skipping" in capsys.readouterr().out


def test_cli_busy_exit_code(
    tmp_path: Path, env: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(hfsync, "make_api", lambda cfg: FakeApi())
    with hfsync.sync_lock(tmp_path):
        assert hfsync.main(["push"], env=env) == hfsync.EXIT_BUSY


def test_token_never_logged(
    tmp_path: Path,
    env: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    capsys: pytest.CaptureFixture[str],
) -> None:
    (tmp_path / "runs").mkdir()
    (tmp_path / "runs" / "f").write_text("1")
    api = FakeApi()
    api.fail = RuntimeError(f"401 for Authorization: Bearer {TOKEN}")
    monkeypatch.setattr(hfsync, "make_api", lambda cfg: api)
    caplog.set_level(logging.DEBUG)
    cfg = cfg_for(tmp_path)
    hfsync.loop(cfg, api, sleep=lambda s: None, max_iterations=2)  # type: ignore[arg-type]
    assert hfsync.main(["push"], env=env) == hfsync.EXIT_ERROR
    out = capsys.readouterr()
    assert TOKEN not in caplog.text
    assert TOKEN not in out.out + out.err
    assert "***" in caplog.text
    assert os.environ.get("HF_TOKEN") != TOKEN
