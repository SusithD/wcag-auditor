from __future__ import annotations

from collections.abc import Callable

from auditor.modules import sc_1_4_3, sc_1_4_11, sc_2_5_8
from auditor.modules.context import ModuleContext
from auditor.schema import Finding

ModuleFn = Callable[[ModuleContext], list[Finding]]

MODULES: dict[str, ModuleFn] = {
    "1.4.3": sc_1_4_3.run,
    "1.4.11": sc_1_4_11.run,
    "2.5.8": sc_2_5_8.run,
}

__all__ = ["MODULES", "ModuleContext", "ModuleFn"]
