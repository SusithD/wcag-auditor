from __future__ import annotations

from collections.abc import Callable

from auditor.modules import (
    sc_1_4_3,
    sc_1_4_11,
    sc_2_4_7,
    sc_2_4_11_12,
    sc_2_4_13,
    sc_2_5_7,
    sc_2_5_8,
)
from auditor.modules.context import ModuleContext
from auditor.schema import Finding

ModuleFn = Callable[[ModuleContext], list[Finding]]

MODULES: dict[str, ModuleFn] = {
    "1.4.3": sc_1_4_3.run,
    "1.4.11": sc_1_4_11.run,
    "2.4.7": sc_2_4_7.run,
    "2.4.11": sc_2_4_11_12.run_min,
    "2.4.12": sc_2_4_11_12.run_enh,
    "2.4.13": sc_2_4_13.run,
    "2.5.7": sc_2_5_7.run,
    "2.5.8": sc_2_5_8.run,
}

__all__ = ["MODULES", "ModuleContext", "ModuleFn"]
