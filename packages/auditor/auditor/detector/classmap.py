from __future__ import annotations

from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml

CLASSMAP_PATH = Path(__file__).with_name("classmap.yaml")
VOCAB_PATH = Path(__file__).with_name("webui_vocab.json")


@lru_cache(maxsize=1)
def _load() -> dict[str, Any]:
    data: dict[str, Any] = yaml.safe_load(CLASSMAP_PATH.read_text(encoding="utf-8"))
    return data


def classes() -> list[str]:
    return list(_load()["classes"])


def token_class() -> dict[str, str]:
    return {tok: cls for cls, toks in _load()["tokens"].items() for tok in toks}


def known_tokens() -> set[str]:
    return set(token_class()) | set(_load()["ignored"])


def class_for(labels: Iterable[str]) -> str | None:
    """The detector class for one WebUI label set, or None when the element is not a target.
    The highest-priority mapped token wins (a text leaf inside a link is a link)."""
    data = _load()
    mapping = token_class()
    found = {mapping[t] for t in labels if t in mapping}
    for cls in data["priority"]:
        if cls in found:
            return str(cls)
    return None
