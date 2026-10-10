from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel


class CatalogueEntry(BaseModel):
    sc: str
    name: str
    level: str
    unit: str
    inputs: str
    procedure: str
    threshold: str
    detectability: str
    tier: str
    act: str


class Catalogue(BaseModel):
    entries: list[CatalogueEntry]
    coverage_claim: str


def _clean(cell: str) -> str:
    return cell.replace("**", "").replace("`", "").strip()


def parse(text: str) -> Catalogue:
    entries: list[CatalogueEntry] = []
    claim = ""
    for line in text.splitlines():
        if line.startswith("Coverage claim"):
            claim = line.strip()
        if not line.startswith("| ") or line.startswith("| SC ") or line.startswith("|---"):
            continue
        cells = [_clean(c) for c in line.strip().strip("|").split(" | ")]
        if len(cells) != 9:
            continue
        sc, _, name = cells[0].partition(" ")
        entries.append(
            CatalogueEntry(
                sc=sc,
                name=name,
                level=cells[1],
                unit=cells[2],
                inputs=cells[3],
                procedure=cells[4],
                threshold=cells[5],
                detectability=cells[6],
                tier=cells[7],
                act=cells[8],
            )
        )
    return Catalogue(entries=entries, coverage_claim=claim)


def load(path: Path) -> Catalogue:
    return parse(path.read_text(encoding="utf-8"))
