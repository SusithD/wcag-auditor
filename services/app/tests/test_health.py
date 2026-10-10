from pathlib import Path

from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient


def test_health(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path, db_url=f"sqlite:///{tmp_path / 'app.db'}")
    with TestClient(create_app(settings)) as client:
        res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
