from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

_JS = Path(__file__).parent
FOCUS_START_JS = (_JS / "focus_start.js").read_text(encoding="utf-8")
FOCUS_INFO_JS = (_JS / "focus_info.js").read_text(encoding="utf-8")


def step_focus(
    press_tab: Callable[[], None],
    get_info: Callable[[], dict[str, Any] | None],
    shoot: Callable[[int, dict[str, Any]], dict[str, Any]],
    max_steps: int,
    max_presses: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    max_presses = max_presses or (max_steps * 4 + 40)
    steps: list[dict[str, Any]] = []
    seen: set[Any] = set()
    last_uid: Any = None
    presses = 0
    stop_reason = "max-steps"
    while len(steps) < max_steps:
        if presses >= max_presses:
            stop_reason = "press-budget"
            break
        press_tab()
        presses += 1
        info = get_info()
        if info is None:
            stop_reason = "left-page"
            break
        uid = info.get("uid")
        if uid == last_uid and info.get("tag") == "iframe":
            continue
        if uid in seen:
            stop_reason = "cycle"
            break
        seen.add(uid)
        last_uid = uid
        k = len(steps)
        steps.append({"index": k, **shoot(k, info), **info})
    return steps, {"presses": presses, "stop_reason": stop_reason}
