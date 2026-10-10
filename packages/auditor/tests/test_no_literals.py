import io
import tokenize
from pathlib import Path

import auditor

PACKAGE = Path(auditor.__file__).parent
SCANNED = [PACKAGE / "modules", PACKAGE / "fusion", PACKAGE / "eval"]
FORBIDDEN = {4.5, 3.0, 24.0, 1.5, 0.3, 18.66}


def forbidden_literals(directory: Path) -> list[str]:
    hits: list[str] = []
    for path in sorted(directory.rglob("*.py")):
        source = path.read_text()
        for tok in tokenize.generate_tokens(io.StringIO(source).readline):
            if tok.type != tokenize.NUMBER:
                continue
            is_float = any(ch in tok.string for ch in ".eE") and not tok.string.startswith("0x")
            value = float(tok.string)
            if value in FORBIDDEN and (is_float or value == 24.0):
                hits.append(f"{path.name}:{tok.start[0]}: {tok.string}")
    return hits


def test_modules_dir_exists() -> None:
    assert (PACKAGE / "modules").is_dir()


def test_no_threshold_literals_in_measurement_code() -> None:
    assert [h for d in SCANNED if d.exists() for h in forbidden_literals(d)] == []


def test_scanner_detects_literals(tmp_path: Path) -> None:
    (tmp_path / "bad.py").write_text("a = 4.5\nb = 24\nc = 3.00\nd = 1.50\ne = 24.0\nf = .3\n")
    (tmp_path / "ok.py").write_text("n = 3\nname = '24'\nk = 2\n")
    hits = forbidden_literals(tmp_path)
    assert [h.split(": ")[1] for h in hits] == ["4.5", "24", "3.00", "1.50", "24.0", ".3"]
