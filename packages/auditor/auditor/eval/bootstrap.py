from __future__ import annotations

from typing import Any

import numpy as np

from auditor.eval.metrics import UnitResult

STRATA = ["real", "synthetic", "combined"]
NONINFERIORITY_MARGIN = -0.05
_CHUNK = 1000


def _stratum_pages(results: list[UnitResult], stratum: str) -> list[str]:
    return sorted({r.page_id for r in results if stratum == "combined" or r.stratum == stratum})


def _count_array(
    results: list[UnitResult], pages: list[str], condition: str, sc: str
) -> np.ndarray:
    index = {p: i for i, p in enumerate(pages)}
    arr = np.zeros((len(pages), 3), dtype=np.int64)
    for r in results:
        if r.condition == condition and r.sc == sc and r.page_id in index:
            row = arr[index[r.page_id]]
            row[0] += r.tp
            row[1] += r.fp
            row[2] += r.fn
    return arr


def _metrics(sums: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    tp, fp, fn = (sums[:, i].astype(float) for i in range(3))
    with np.errstate(divide="ignore", invalid="ignore"):
        precision = np.where(tp + fp > 0, tp / (tp + fp), np.nan)
        recall = np.where(tp + fn > 0, tp / (tp + fn), np.nan)
        f1 = np.where(
            (precision + recall) > 0, 2 * precision * recall / (precision + recall), np.nan
        )
    return precision, recall, f1


def _ci(values: np.ndarray) -> dict[str, float | int | None]:
    valid = values[~np.isnan(values)]
    if valid.size == 0:
        return {"low": None, "high": None, "n_valid": 0}
    low, high = np.percentile(valid, [2.5, 97.5])
    return {"low": float(low), "high": float(high), "n_valid": int(valid.size)}


def bootstrap(
    results: list[UnitResult], conditions: list[str], scs: list[str], n: int, seed: int
) -> dict[str, Any]:
    """Cluster bootstrap over pages: 95% CIs for P/R/F1, and delta-precision (hybrid minus
    rule_only) on the same resamples with the H1 non-inferiority verdict."""
    out: dict[str, Any] = {"resamples": n, "seed": seed, "ci": {}, "delta_precision": {}}
    if n <= 0:
        return out
    rng = np.random.default_rng(seed)
    for stratum in STRATA:
        pages = _stratum_pages(results, stratum)
        if not pages:
            continue
        arrays = {(c, sc): _count_array(results, pages, c, sc) for c in conditions for sc in scs}
        samples: dict[tuple[str, str], list[np.ndarray]] = {k: [] for k in arrays}
        done = 0
        while done < n:
            size = min(_CHUNK, n - done)
            idx = rng.integers(0, len(pages), size=(size, len(pages)))
            for key, arr in arrays.items():
                samples[key].append(arr[idx].sum(axis=1))
            done += size
        stacked = {k: np.concatenate(v) for k, v in samples.items()}
        for (c, sc), sums in stacked.items():
            p, r, f = _metrics(sums)
            out["ci"].setdefault(c, {}).setdefault(stratum, {})[sc] = {
                "precision": _ci(p),
                "recall": _ci(r),
                "f1": _ci(f),
            }
        if "hybrid" in conditions and "rule_only" in conditions:
            for sc in scs:
                ph, _, _ = _metrics(stacked[("hybrid", sc)])
                pr, _, _ = _metrics(stacked[("rule_only", sc)])
                ci = _ci(ph - pr)
                low = ci["low"]
                out["delta_precision"].setdefault(stratum, {})[sc] = {
                    **ci,
                    "non_inferior": None if low is None else bool(low >= NONINFERIORITY_MARGIN),
                    "margin": NONINFERIORITY_MARGIN,
                }
    return out
