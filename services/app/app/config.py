from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_url: str

    @classmethod
    def from_env(cls) -> Settings:
        data_dir = Path(os.environ.get("DATA_DIR", "./data")).resolve()
        return cls(
            data_dir=data_dir,
            db_url=os.environ.get("DATABASE_URL", f"sqlite:///{data_dir / 'app.db'}"),
        )
