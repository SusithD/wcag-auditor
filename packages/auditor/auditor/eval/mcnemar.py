from __future__ import annotations

from typing import Any

from statsmodels.stats.contingency_tables import mcnemar
from statsmodels.stats.multitest import multipletests

from auditor.eval.metrics import UnitResult

DEGENERATE = "degenerate: no discordant pairs, so the test has no information"


def _key(r: UnitResult) -> tuple[str, str, int | None]:
    return (r.page_id, r.sc, r.key)


def paired_outcomes(
    results: list[UnitResult], cond_a: str, cond_b: str, sc: str, stratum: str
) -> tuple[int, int, int, int]:
    """(both correct, only A correct, only B correct, both wrong) over shared units."""
    a = {_key(r): r.correct for r in results if r.condition == cond_a and r.sc == sc}
    b = {_key(r): r.correct for r in results if r.condition == cond_b and r.sc == sc}
    strata = {_key(r): r.stratum for r in results if r.condition == cond_a and r.sc == sc}
    n11 = n10 = n01 = n00 = 0
    for k in a.keys() & b.keys():
        if stratum != "combined" and strata[k] != stratum:
            continue
        if a[k] and b[k]:
            n11 += 1
        elif a[k]:
            n10 += 1
        elif b[k]:
            n01 += 1
        else:
            n00 += 1
    return n11, n10, n01, n00


def run_mcnemar(
    results: list[UnitResult], cond_a: str, cond_b: str, scs: list[str], strata: list[str]
) -> dict[str, Any]:
    """Exact McNemar per (stratum, SC); Benjamini-Hochberg over the SCs within each stratum
    (the plan's family of eight comparisons)."""
    out: dict[str, Any] = {
        "a": cond_a,
        "b": cond_b,
        "tests": {},
        "bh_adjusted": {},
        "bh_family": "SCs within one stratum",
    }
    for stratum in strata:
        keys: list[str] = []
        pvals: list[float] = []
        for sc in scs:
            n11, n10, n01, n00 = paired_outcomes(results, cond_a, cond_b, sc, stratum)
            entry: dict[str, Any] = {
                "both_correct": n11,
                "only_a_correct": n10,
                "only_b_correct": n01,
                "both_wrong": n00,
            }
            if n10 + n01 == 0:
                entry.update(p_value=None, note=DEGENERATE)
            else:
                res = mcnemar([[n11, n10], [n01, n00]], exact=True)
                entry["p_value"] = float(res.pvalue)
                keys.append(sc)
                pvals.append(float(res.pvalue))
            out["tests"].setdefault(stratum, {})[sc] = entry
        if pvals:
            adjusted = multipletests(pvals, method="fdr_bh")[1]
            for sc, p_adj in zip(keys, adjusted, strict=True):
                out["bh_adjusted"].setdefault(stratum, {})[sc] = float(p_adj)
    return out
