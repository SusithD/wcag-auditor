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
    monkeypatch.setattr(detector, "DEFAULT_MODEL", model)
    assert versions.collect()["model_sha"] == hashlib.sha256(b"weights").hexdigest()


def test_model_sha_is_none_without_a_model(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(detector, "DEFAULT_MODEL", tmp_path / "missing.onnx")
    assert versions.collect()["model_sha"] is None
