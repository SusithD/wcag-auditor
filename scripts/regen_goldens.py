from __future__ import annotations

import json
from pathlib import Path

from auditor.elements.dom import DomElementSource
from auditor.features import compute
from auditor.schema import Capture

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures"
GOLDEN = FIXTURES / "golden" / "elements"


def dump(folder: Path) -> dict[str, object]:
    capture = Capture.from_folder(folder)
    source = DomElementSource()
    dumped, elements = source.dump(capture)
    return {"features": compute(capture, elements).model_dump(), **dumped}


def main() -> None:
    GOLDEN.mkdir(parents=True, exist_ok=True)
    for meta in sorted(FIXTURES.glob("**/meta.json")):
        if "golden" in meta.parts:
            continue
        folder = meta.parent
        out = GOLDEN / f"{folder.name}.json"
        out.write_text(json.dumps(dump(folder), indent=1, sort_keys=True) + "\n")
        print(out.relative_to(ROOT))


if __name__ == "__main__":
    main()
