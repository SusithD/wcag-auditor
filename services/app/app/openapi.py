from __future__ import annotations

import json
import sys
from pathlib import Path

from app.config import Settings
from app.main import create_app


def main(out: Path) -> None:
    app = create_app(Settings(data_dir=out.parent, db_url="sqlite://"))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(app.openapi(), indent=2))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
