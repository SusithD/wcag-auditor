from __future__ import annotations

import argparse
import contextlib
import fcntl
import hashlib
import json
import logging
import os
import shutil
import signal
import sqlite3
import sys
import tempfile
import threading
import time
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from huggingface_hub import CommitOperationAdd, CommitOperationDelete, HfApi
from huggingface_hub.errors import RevisionNotFoundError

log = logging.getLogger("app.hfsync")

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_BUSY = 3

DB_NAME = "app.db"
META_NAME = "sync_meta.json"
MANIFEST_NAME = ".hfsync.json"
LOCK_NAME = ".hfsync.lock"
SYNC_DIRS = ("runs", "uploads")
EXCLUDED_DIR_NAMES = frozenset({"__pycache__", ".cache", "browser-profile", "tmp", ".tmp"})
EXCLUDED_SUFFIXES = (".tmp", ".part", ".partial", ".lock", ".pyc", "-wal", "-shm", "-journal")
MAX_BACKOFF_S = 3600.0
DEFAULT_SQUASH_EVERY = 100


class SyncBusyError(RuntimeError):
    pass


@dataclass(frozen=True)
class HfConfig:
    data_dir: Path
    token: str | None
    dataset_repo: str | None
    model_repo: str | None
    model_file: str
    interval_s: float
    squash_every: int

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> HfConfig:
        e = os.environ if env is None else env
        return cls(
            data_dir=Path(e.get("DATA_DIR", "./data")).resolve(),
            token=e.get("HF_TOKEN") or None,
            dataset_repo=e.get("HF_DATASET_REPO") or None,
            model_repo=e.get("HF_MODEL_REPO") or None,
            model_file=e.get("HF_MODEL_FILE") or "detector.onnx",
            interval_s=float(e.get("SYNC_INTERVAL_S") or "300"),
            squash_every=int(e.get("HF_SQUASH_EVERY") or DEFAULT_SQUASH_EVERY),
        )

    @property
    def dataset_ready(self) -> bool:
        return bool(self.token and self.dataset_repo)


def redact(text: str, token: str | None) -> str:
    return text.replace(token, "***") if token else text


def make_api(cfg: HfConfig) -> HfApi:
    return HfApi(token=cfg.token)


@contextlib.contextmanager
def sync_lock(data_dir: Path) -> Iterator[None]:
    data_dir.mkdir(parents=True, exist_ok=True)
    with open(data_dir / LOCK_NAME, "a+") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise SyncBusyError("another sync is running") from exc
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _excluded(path: Path) -> bool:
    return path.name.endswith(EXCLUDED_SUFFIXES) or path.name == ".DS_Store"


def scan_files(data_dir: Path) -> dict[str, tuple[int, int]]:
    found: dict[str, tuple[int, int]] = {}
    for sub in SYNC_DIRS:
        root = data_dir / sub
        if not root.is_dir():
            continue
        for current, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in EXCLUDED_DIR_NAMES]
            for name in files:
                path = Path(current) / name
                if _excluded(path) or path.is_symlink():
                    continue
                try:
                    st = path.stat()
                except OSError:
                    continue
                found[path.relative_to(data_dir).as_posix()] = (st.st_size, st.st_mtime_ns)
    return found


@dataclass
class Manifest:
    files: dict[str, tuple[int, int]]
    db_sha: str | None = None
    pushes: int = 0

    @classmethod
    def load(cls, data_dir: Path) -> Manifest:
        try:
            raw = json.loads((data_dir / MANIFEST_NAME).read_text())
            return cls(
                files={k: (int(v[0]), int(v[1])) for k, v in raw.get("files", {}).items()},
                db_sha=raw.get("db_sha"),
                pushes=int(raw.get("pushes", 0)),
            )
        except (OSError, ValueError, TypeError, IndexError):
            return cls(files={})

    def save(self, data_dir: Path) -> None:
        payload = {
            "files": {k: list(v) for k, v in self.files.items()},
            "db_sha": self.db_sha,
            "pushes": self.pushes,
        }
        tmp = data_dir / f"{MANIFEST_NAME}.tmp"
        tmp.write_text(json.dumps(payload))
        os.replace(tmp, data_dir / MANIFEST_NAME)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def backup_sqlite(src: Path, dest: Path) -> None:
    source = sqlite3.connect(src, timeout=30)
    try:
        target = sqlite3.connect(dest)
        try:
            source.backup(target)
        finally:
            target.close()
    finally:
        source.close()


def _now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def ensure_dataset(api: HfApi, repo: str) -> None:
    api.create_repo(repo, repo_type="dataset", private=True, exist_ok=True)


def restore(cfg: HfConfig, api: HfApi) -> str:
    assert cfg.dataset_repo
    cfg.data_dir.mkdir(parents=True, exist_ok=True)
    ensure_dataset(api, cfg.dataset_repo)
    stage = Path(tempfile.mkdtemp(prefix=".hfsync-restore-", dir=cfg.data_dir))
    try:
        try:
            api.snapshot_download(cfg.dataset_repo, repo_type="dataset", local_dir=stage)
        except RevisionNotFoundError:
            return "remote repo is empty, nothing to restore"
        return _apply_snapshot(cfg, stage)
    finally:
        shutil.rmtree(stage, ignore_errors=True)


def _apply_snapshot(cfg: HfConfig, stage: Path) -> str:
    manifest = Manifest.load(cfg.data_dir)
    notes: list[str] = []
    remote_db = stage / DB_NAME
    local_db = cfg.data_dir / DB_NAME
    if remote_db.is_file():
        pushed_at = _remote_db_time(stage)
        if local_db.exists() and local_db.stat().st_mtime > pushed_at:
            notes.append("kept newer local app.db")
        else:
            staged = cfg.data_dir / f"{DB_NAME}.restore"
            shutil.copyfile(remote_db, staged)
            for suffix in ("-wal", "-shm"):
                (cfg.data_dir / f"{DB_NAME}{suffix}").unlink(missing_ok=True)
            os.replace(staged, local_db)
            manifest.db_sha = sha256_file(local_db)
            notes.append("restored app.db")
    copied = 0
    for sub in SYNC_DIRS:
        root = stage / sub
        if not root.is_dir():
            continue
        for src in sorted(p for p in root.rglob("*") if p.is_file()):
            rel = src.relative_to(stage).as_posix()
            dest = cfg.data_dir / rel
            if dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dest)
            st = dest.stat()
            manifest.files[rel] = (st.st_size, st.st_mtime_ns)
            copied += 1
    manifest.save(cfg.data_dir)
    notes.append(f"restored {copied} files")
    return ", ".join(notes)


def _remote_db_time(stage: Path) -> float:
    try:
        return float(json.loads((stage / META_NAME).read_text())["db_pushed_at"])
    except (OSError, ValueError, KeyError, TypeError):
        return float("inf")


def push(cfg: HfConfig, api: HfApi) -> str:
    assert cfg.dataset_repo
    with sync_lock(cfg.data_dir):
        manifest = Manifest.load(cfg.data_dir)
        current = scan_files(cfg.data_dir)
        changed = sorted(p for p, sig in current.items() if manifest.files.get(p) != sig)
        deleted = sorted(p for p in manifest.files if p not in current)
        with tempfile.TemporaryDirectory(prefix=".hfsync-push-", dir=cfg.data_dir) as tmp:
            db_copy: Path | None = None
            db_sha: str | None = None
            live_db = cfg.data_dir / DB_NAME
            if live_db.is_file():
                db_copy = Path(tmp) / DB_NAME
                backup_sqlite(live_db, db_copy)
                db_sha = sha256_file(db_copy)
            db_changed = db_copy is not None and db_sha != manifest.db_sha
            if not changed and not deleted and not db_changed:
                return "nothing changed"
            operations: list[CommitOperationAdd | CommitOperationDelete] = []
            if db_changed and db_copy is not None:
                operations.append(CommitOperationAdd(DB_NAME, db_copy))
            operations.extend(CommitOperationAdd(p, cfg.data_dir / p) for p in changed)
            operations.extend(CommitOperationDelete(p) for p in deleted)
            meta = json.dumps({"db_pushed_at": time.time(), "pushed_at": _now_iso()}).encode()
            operations.append(CommitOperationAdd(META_NAME, meta))
            ensure_dataset(api, cfg.dataset_repo)
            api.create_commit(
                cfg.dataset_repo,
                operations,
                repo_type="dataset",
                commit_message=f"sync {_now_iso()}",
            )
        manifest.files = current
        if db_changed:
            manifest.db_sha = db_sha
        manifest.pushes += 1
        manifest.save(cfg.data_dir)
        _maybe_squash(cfg, api, manifest.pushes)
        db_note = "yes" if db_changed else "no"
        return f"pushed {len(changed)} files, {len(deleted)} deletions, db={db_note}"


def _maybe_squash(cfg: HfConfig, api: HfApi, pushes: int) -> None:
    assert cfg.dataset_repo
    if cfg.squash_every <= 0 or pushes % cfg.squash_every:
        return
    try:
        api.super_squash_history(cfg.dataset_repo, repo_type="dataset")
        log.info("squashed dataset history after %d pushes", pushes)
    except Exception as exc:
        log.warning("history squash failed: %s", redact(str(exc), cfg.token))


def loop(
    cfg: HfConfig,
    api: HfApi,
    *,
    sleep: Callable[[float], object] = time.sleep,
    stop: threading.Event | None = None,
    max_iterations: int | None = None,
) -> None:
    stop = stop or threading.Event()
    failures = 0
    iteration = 0
    while not stop.is_set() and (max_iterations is None or iteration < max_iterations):
        iteration += 1
        try:
            log.info("%s", push(cfg, api))
            failures = 0
        except SyncBusyError:
            log.info("push skipped, another sync is running")
        except Exception as exc:
            failures += 1
            log.error("push failed (%d in a row): %s", failures, redact(str(exc), cfg.token))
        delay = (
            cfg.interval_s
            if failures == 0
            else min(cfg.interval_s * 2 ** (failures - 1), MAX_BACKOFF_S)
        )
        sleep(delay)
    if stop.is_set():
        with contextlib.suppress(Exception):
            log.info("final %s", push(cfg, api))


def _local_blob_sha(path: Path) -> str:
    data = path.read_bytes()
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()  # noqa: S324


def fetch_model(cfg: HfConfig, api: HfApi) -> str:
    assert cfg.model_repo
    dest = cfg.data_dir / "models" / "detector.onnx"
    dest.parent.mkdir(parents=True, exist_ok=True)
    infos = api.get_paths_info(cfg.model_repo, [cfg.model_file], repo_type="model")
    info = infos[0] if infos else None
    if dest.is_file() and info is not None:
        lfs = getattr(info, "lfs", None)
        remote_sha = getattr(lfs, "sha256", None) if lfs else None
        if remote_sha:
            if sha256_file(dest) == remote_sha:
                return "model up to date"
        elif getattr(info, "blob_id", None) == _local_blob_sha(dest):
            return "model up to date"
    with tempfile.TemporaryDirectory(prefix=".hfsync-model-", dir=dest.parent) as tmp:
        fetched = api.hf_hub_download(
            cfg.model_repo, cfg.model_file, repo_type="model", local_dir=tmp
        )
        os.replace(fetched, dest)
    return f"model downloaded to {dest}"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.hfsync", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, text in (
        ("restore", "download the dataset snapshot into DATA_DIR"),
        ("push", "upload app.db and changed run files once"),
        ("loop", "push every SYNC_INTERVAL_S seconds, forever"),
        ("model", "fetch the detector model from HF_MODEL_REPO"),
    ):
        sub.add_parser(name, help=text)
    return parser


def main(argv: Sequence[str] | None = None, env: dict[str, str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = _parser().parse_args(argv)
    cfg = HfConfig.from_env(env)
    command: str = args.command
    if command == "model":
        if not cfg.model_repo:
            print("HF_MODEL_REPO not set, skipping model fetch")
            return EXIT_OK
    elif not cfg.dataset_ready:
        print("HF_TOKEN and HF_DATASET_REPO not both set, skipping sync")
        return EXIT_OK
    api = make_api(cfg)
    try:
        if command == "restore":
            with sync_lock(cfg.data_dir):
                print(restore(cfg, api))
        elif command == "push":
            print(push(cfg, api))
        elif command == "model":
            print(fetch_model(cfg, api))
        else:
            stop = threading.Event()
            signal.signal(signal.SIGTERM, lambda *_: stop.set())
            signal.signal(signal.SIGINT, lambda *_: stop.set())
            loop(cfg, api, sleep=stop.wait, stop=stop)
    except SyncBusyError:
        print("another sync is running", file=sys.stderr)
        return EXIT_BUSY
    except Exception as exc:
        print(f"hfsync {command} failed: {redact(str(exc), cfg.token)}", file=sys.stderr)
        return EXIT_ERROR
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
