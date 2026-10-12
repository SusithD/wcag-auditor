from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _path(value: str | None) -> Path | None:
    return Path(value).resolve() if value else None


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    db_url: str
    folder_roots: tuple[Path, ...] = ()
    job_timeout_s: float = 900
    eval_timeout_s: float = 6 * 3600
    pdf: bool = True
    benchmark_dir: Path | None = None
    truth_path: Path | None = None
    eval_import_dirs: tuple[Path, ...] = ()
    catalogue_path: Path | None = None
    detector_eval_dir: Path | None = None
    study_dir: Path | None = None
    study_ethics_approved: bool = False
    study_admin_token: str | None = None
    decided_by_name: str = "Local user"
    extra_headers_json: str | None = field(default=None, repr=False)
    verify_timeout_s: float = 300
    app_env: str = "development"
    allow_private_targets_override: bool | None = None
    max_upload_files: int = 4
    max_upload_bytes: int = 25 * 1024 * 1024
    runs_per_minute: float = 10
    max_queued_runs: int = 20
    study_per_minute: float = 300

    @property
    def production(self) -> bool:
        return self.app_env == "production"

    @property
    def allow_private_targets(self) -> bool:
        if self.allow_private_targets_override is not None:
            return self.allow_private_targets_override
        return not self.production

    @property
    def catalogue_file(self) -> Path:
        return self.catalogue_path or Path(__file__).resolve().parents[3] / "CHECK_CATALOGUE.md"

    @property
    def detector_eval_path(self) -> Path:
        return self.detector_eval_dir or Path(__file__).resolve().parents[3] / "eval" / "detector"

    @property
    def study_path(self) -> Path:
        return self.study_dir or Path(__file__).resolve().parents[3] / "study"

    @property
    def extra_header_names(self) -> list[str]:
        from auditor.capture.identity import header_names, parse_extra_headers

        return header_names(parse_extra_headers(self.extra_headers_json))

    @property
    def profile_dir(self) -> Path:
        return self.data_dir / "browser-profile"

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
        app_env = os.environ.get("APP_ENV", "development").strip().lower()
        if app_env not in {"production", "development"}:
            raise ValueError("APP_ENV must be 'production' or 'development'")
        roots = os.environ.get("FOLDER_ROOTS")
        private = os.environ.get("ALLOW_PRIVATE_TARGETS", "").strip()
        settings = cls(
            data_dir=data_dir,
            db_url=os.environ.get("DATABASE_URL", f"sqlite:///{data_dir / 'app.db'}"),
            folder_roots=tuple(Path(p).resolve() for p in roots.split(os.pathsep) if p)
            if roots
            else (() if app_env == "production" else (default_root.resolve(),)),
            job_timeout_s=float(os.environ.get("JOB_TIMEOUT_S", "900")),
            eval_timeout_s=float(os.environ.get("EVAL_TIMEOUT_S", str(6 * 3600))),
            pdf=os.environ.get("AUDIT_PDF", "1") != "0",
            benchmark_dir=_path(os.environ.get("BENCHMARK_DIR")),
            truth_path=_path(os.environ.get("TRUTH_PATH")),
            eval_import_dirs=tuple(
                Path(p).resolve()
                for p in os.environ.get("EVAL_IMPORT_DIRS", "").split(os.pathsep)
                if p
            ),
            catalogue_path=_path(os.environ.get("CATALOGUE_PATH")),
            detector_eval_dir=_path(os.environ.get("DETECTOR_EVAL_DIR")),
            study_dir=_path(os.environ.get("STUDY_DIR")),
            study_ethics_approved=os.environ.get("STUDY_ETHICS_APPROVED") == "1",
            study_admin_token=(os.environ.get("STUDY_ADMIN_TOKEN") or "").strip() or None,
            decided_by_name=os.environ.get("DECIDED_BY_NAME") or "Local user",
            extra_headers_json=os.environ.get("AUDIT_EXTRA_HEADERS") or None,
            verify_timeout_s=float(os.environ.get("VERIFY_TIMEOUT_S", "300")),
            app_env=app_env,
            allow_private_targets_override=None if not private else private == "1",
            max_upload_files=int(os.environ.get("MAX_UPLOAD_FILES", "4")),
            max_upload_bytes=int(os.environ.get("MAX_UPLOAD_BYTES", str(25 * 1024 * 1024))),
            runs_per_minute=float(os.environ.get("RUNS_PER_MINUTE", "10")),
            max_queued_runs=int(os.environ.get("MAX_QUEUED_RUNS", "20")),
            study_per_minute=float(os.environ.get("STUDY_PER_MINUTE", "300")),
        )
        _ = settings.extra_header_names
        return settings
