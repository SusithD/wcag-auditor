from __future__ import annotations

import threading
from typing import Any

_lock = threading.Lock()
_cm: Any = None
_pw: Any = None
_refs = 0


def acquire() -> Any:
    """One sync Playwright driver per process; a second sync_playwright() in a thread fails."""
    global _cm, _pw, _refs
    with _lock:
        if _refs == 0:
            from playwright.sync_api import sync_playwright

            _cm = sync_playwright()
            _pw = _cm.__enter__()
        _refs += 1
        return _pw


def release() -> None:
    global _cm, _pw, _refs
    with _lock:
        _refs -= 1
        if _refs == 0 and _cm is not None:
            try:
                _cm.__exit__(None, None, None)
            finally:
                _cm, _pw = None, None
