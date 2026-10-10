from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _path(value: str | None) -> Path | None:
    return Path(value).resolve() if value else None


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_url: str
    folder_roots: tuple[Path, ...] = ()
    job_timeout_s: float = 900
    pdf: bool = True
    benchmark_dir: Path | None = None
    truth_path: Path | None = None
    eval_import_dirs: tuple[Path, ...] = ()
    catalogue_path: Path | None = None

    @property
    def catalogue_file(self) -> Path:
        return self.catalogue_path or Path(__file__).resolve().parents[3] / "CHECK_CATALOGUE.md"

    @property
    def eval_dir(self) -> Path:
        return self.data_dir / "eval"

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
            benchmark_dir=_path(os.environ.get("BENCHMARK_DIR")),
            truth_path=_path(os.environ.get("TRUTH_PATH")),
            eval_import_dirs=tuple(
                Path(p).resolve()
                for p in os.environ.get("EVAL_IMPORT_DIRS", "").split(os.pathsep)
                if p
            ),
            catalogue_path=_path(os.environ.get("CATALOGUE_PATH")),
        )
