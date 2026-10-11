import hashlib
from pathlib import Path

import pytest
from auditor import versions
from auditor.elements import detector


def test_model_sha_hashes_the_default_detector_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    model = tmp_path / "detector.onnx"
    model.write_bytes(b"weights")
    monkeypatch.delenv(detector.MODEL_ENV, raising=False)
    monkeypatch.setattr(detector, "DEFAULT_MODEL", model)
    assert versions.collect()["model_sha"] == hashlib.sha256(b"weights").hexdigest()


def test_model_sha_follows_the_model_the_detector_would_load(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    other = tmp_path / "other.onnx"
    other.write_bytes(b"other weights")
    monkeypatch.setenv(detector.MODEL_ENV, str(other))
    assert versions.collect()["model_sha"] == hashlib.sha256(b"other weights").hexdigest()


def test_model_sha_is_none_without_a_model(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(detector.MODEL_ENV, raising=False)
    monkeypatch.setattr(detector, "DEFAULT_MODEL", tmp_path / "missing.onnx")
    assert versions.collect()["model_sha"] is None
