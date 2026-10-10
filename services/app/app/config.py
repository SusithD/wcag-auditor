from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_url: str
    folder_roots: tuple[Path, ...] = ()
    job_timeout_s: float = 900
    pdf: bool = True

    @property
    def runs_dir(self) -> Path:
        return self.data_dir / "runs"

    @property
    def uploads_dir(self) -> Path:
        return self.data_dir / "uploads"

    @classmethod
    def from_env(cls) -> Settings:
        data_dir = Path(os.environ.get("DATA_DIR", "./data")).resolve()
        default_root = Path(__file__).resolve().parents[3] / "fixtures"
        roots = os.environ.get("FOLDER_ROOTS")
        return cls(
            data_dir=data_dir,
            db_url=os.environ.get("DATABASE_URL", f"sqlite:///{data_dir / 'app.db'}"),
            folder_roots=tuple(Path(p).resolve() for p in roots.split(os.pathsep) if p)
            if roots
            else (default_root.resolve(),),
            job_timeout_s=float(os.environ.get("JOB_TIMEOUT_S", "900")),
            pdf=os.environ.get("AUDIT_PDF", "1") != "0",
        )
