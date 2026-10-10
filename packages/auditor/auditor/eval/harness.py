from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from auditor import protocol, versions
from auditor.eval import failures as failures_mod
from auditor.eval import tables
from auditor.eval.bootstrap import STRATA, bootstrap
from auditor.eval.mcnemar import run_mcnemar
from auditor.eval.metrics import MatchConfig, UnitResult, aggregate, score_item
from auditor.eval.units import (
    ItemTruth,
    Prediction,
    load_truth_file,
    real_truth,
    synthetic_truth,
)
from auditor.rules.rulemap import COVERED_SCS
from auditor.schema import BBox, Capture

SKIP_PARTS = {"golden", "sites", "vectors", "baseline_golden"}
SWEEP_IOU = [i / 10 for i in range(1, 8)]


@dataclass
class EvalConfig:
    benchmark: Path
    out: Path
    truth: Path | None = None
    conditions: list[str] = field(default_factory=lambda: ["rule_only"])
    seed: int = 20261004
    bootstrap: int = 10000
    rule_findings: Path | None = None
    include_needs_review: bool = False


def discover(benchmark: Path) -> list[Path]:
    folders = []
    for meta in sorted(benchmark.glob("**/meta.json")):
        rel = set(meta.relative_to(benchmark).parts)
        if rel & SKIP_PARTS or any(part.startswith("_") for part in rel):
            continue
        folders.append(meta.parent)
    return folders


class RulePredictor:
    def __init__(self, cfg: EvalConfig) -> None:
        self.cfg = cfg
        self._runner: Any = None
        self.cache = cfg.out / "rule_cache"
        self.dropped = {"boxless": 0, "empty_box": 0, "needs_review_excluded": 0}

    def raw(self, capture: Capture) -> dict[str, Any]:
        name = capture.path.name
        candidates = []
        if self.cfg.rule_findings:
            candidates.append(self.cfg.rule_findings / name / "baseline_findings.json")
            candidates.append(self.cfg.rule_findings / f"{name}.json")
        candidates.append(self._cache_path(capture))
        for path in candidates:
            if path.is_file():
                data: dict[str, Any] = json.loads(path.read_text(encoding="utf-8"))
                return data
        from auditor.rules.axe import AxeRunner, dumps

        if self._runner is None:
            self._runner = AxeRunner()
        result: dict[str, Any] = self._runner.run(capture)
        self.cache.mkdir(parents=True, exist_ok=True)
        target = self._cache_path(capture)
        tmp = target.with_suffix(".tmp")
        tmp.write_text(dumps(result), encoding="utf-8")
        tmp.replace(target)
        return result

    def _cache_path(self, capture: Capture) -> Path:
        digest = str(capture.meta.get("screenshot_sha256"))[:12]
        return self.cache / f"{capture.path.name}.{digest}.json"

    def predict(self, capture: Capture) -> Prediction:
        pred = Prediction()
        for f in self.raw(capture)["findings"]:
            if f["kind"] == "needs-review" and not self.cfg.include_needs_review:
                self.dropped["needs_review_excluded"] += 1
                continue
            if not f["bbox"]:
                self.dropped["boxless"] += 1
                continue
            if f["bbox"]["w"] <= 0 or f["bbox"]["h"] <= 0:
                self.dropped["empty_box"] += 1
                continue
            pred.page_boxes.setdefault(f["sc"], []).append(BBox.model_validate(f["bbox"]))
        return pred

    def close(self) -> None:
        if self._runner is not None:
            self._runner.close()


class PixelPredictor:
    """Pixel-channel modules over the element source each capture allows (ADR-012): stored or
    re-rendered DOM geometry when it exists, OCR text lines otherwise.

    Same tier policy as the rule channel (ADR-014): automated findings only unless
    include_needs_review is set.
    """

    def __init__(self, cfg: EvalConfig) -> None:
        from auditor.elements.select import SourceSelector

        self.cfg = cfg
        self.sources = SourceSelector()
        self.source_counts = {"dom": 0, "pixel": 0}
        self.needs_review_excluded = 0

    def predict(self, capture: Capture) -> Prediction:
        from auditor.elements.dom import GeometryUnavailable
        from auditor.modules import MODULES, ModuleContext

        name, source = self.sources.for_capture(capture)
        try:
            elements = source.elements(capture)
        except GeometryUnavailable:
            name, source = "pixel", self.sources.pixel
            elements = source.elements(capture)
        self.source_counts[name] += 1
        ctx = ModuleContext.load(capture, elements, has_geometry=name == "dom")
        pred = Prediction()
        for sc, run in MODULES.items():
            for finding in run(ctx):
                if finding.tier == "not-assessable":
                    continue
                if finding.tier == "needs-review" and not self.cfg.include_needs_review:
                    self.needs_review_excluded += 1
                    continue
                if finding.focus_index is not None:
                    pred.stops.setdefault(sc, set()).add(finding.focus_index)
                elif finding.bbox is not None:
                    pred.page_boxes.setdefault(sc, []).append(finding.bbox)
        return pred

    def close(self) -> None:
        self.sources.close()


def _sha(parts: list[str]) -> str:
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def _file_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _truth_for(
    capture: Capture, gt: dict[str, dict[str, Any]] | None, excluded: set[str]
) -> tuple[ItemTruth | None, str | None]:
    name = capture.path.name
    folder_truth = capture.path / "truth.json"
    if capture.meta.get("origin") == "synth":
        if capture.viewport != "desktop" or not folder_truth.is_file():
            return None, None
        data = json.loads(folder_truth.read_text(encoding="utf-8"))
        return synthetic_truth(capture, data), folder_truth.read_text(encoding="utf-8")
    if gt is not None:
        item = gt.get(name)
        return (
            (real_truth(item, excluded), json.dumps(item, sort_keys=True)) if item else (None, None)
        )
    if folder_truth.is_file():
        item = json.loads(folder_truth.read_text(encoding="utf-8"))
        return real_truth(item, excluded), folder_truth.read_text(encoding="utf-8")
    return None, None


def _page_features(capture: Capture) -> dict[str, Any]:
    from auditor.features import is_non_responsive

    return {
        "focus_stop_count": len(capture.focus_steps),
        "is_non_responsive": is_non_responsive(capture),
        "sector": capture.meta.get("sector"),
    }


SUPPORTED_CONDITIONS = {"rule_only", "pixel"}
ALL_SCS = ["1.4.3", "1.4.11", "2.4.7", "2.4.11", "2.4.12", "2.4.13", "2.5.7", "2.5.8"]


def _folder_sha(capture: Capture) -> str:
    parts = [
        (capture.path / "meta.json").read_bytes(),
        str(capture.meta.get("screenshot_sha256")).encode(),
    ]
    dom = capture.path / "dom.html"
    if dom.is_file():
        parts.append(dom.read_bytes())
    return hashlib.sha256(b"\x00".join(parts)).hexdigest()


def run_eval(cfg: EvalConfig) -> dict[str, Any]:
    unsupported = [c for c in cfg.conditions if c not in SUPPORTED_CONDITIONS]
    if unsupported:
        raise NotImplementedError(f"condition(s) {unsupported} are not available yet")
    proto = protocol.load()
    match = proto.thresholds.match
    gt: dict[str, dict[str, Any]] | None = None
    excluded: set[str] = set()
    if cfg.truth is not None:
        gt, excluded = load_truth_file(cfg.truth)
    predictor = RulePredictor(cfg)
    results: list[UnitResult] = []
    sweep_inputs: list[tuple[ItemTruth, str, Prediction]] = []
    features: dict[str, dict[str, Any]] = {}
    bench_parts: list[str] = []
    truth_parts: list[str] = []
    failed: list[dict[str, str]] = []
    tools: dict[str, Any] = {}
    unlabelled = 0
    base = MatchConfig(match.iou, match.containment, True)
    pixel: PixelPredictor | None = None
    try:
        pixel = PixelPredictor(cfg) if "pixel" in cfg.conditions else None
        for folder in discover(cfg.benchmark):
            capture = Capture.from_folder(folder)
            truth, raw_truth = _truth_for(capture, gt, excluded)
            if truth is None:
                unlabelled += 1
                continue
            preds: dict[str, Prediction] = {}
            try:
                for cond in cfg.conditions:
                    if cond == "pixel" and pixel is not None:
                        preds[cond] = pixel.predict(capture)
                    else:
                        preds[cond] = predictor.predict(capture)
            except Exception as exc:
                failed.append(
                    {"page_id": folder.name, "error": f"{type(exc).__name__}: {exc}"[:300]}
                )
                continue
            bench_parts.append(f"{folder.name}:{_folder_sha(capture)}")
            truth_parts.append(f"{folder.name}:{raw_truth}")
            features[truth.page_id] = _page_features(capture)
            tools = tools or dict(capture.meta.get("tools") or {})
            for cond, pred in preds.items():
                results += score_item(truth, pred, cond, base)
                sweep_inputs.append((truth, cond, pred))
    finally:
        predictor.close()
        if pixel is not None:
            pixel.close()
    present = {r.sc for r in results}
    all_scs = [s for s in ALL_SCS if s in present]
    run_versions = versions.collect({"tools": tools})
    truth_sha = _sha(sorted(truth_parts))
    if cfg.truth is not None:
        truth_sha = _sha([_file_sha(cfg.truth), truth_sha])
    metrics: dict[str, Any] = {
        "meta": {
            "benchmark_sha": _sha(sorted(bench_parts)),
            "truth_sha": truth_sha,
            "protocol_sha": protocol.sha256(),
            "versions": {k: v for k, v in run_versions.items() if k != "git_sha"},
            "seed": cfg.seed,
            "bootstrap_resamples": cfg.bootstrap,
            "conditions": cfg.conditions,
            "include_needs_review": cfg.include_needs_review,
            "match": {
                "iou": match.iou,
                "containment": match.containment,
                "rule": "iou-or-containment (ADR-013)",
            },
            "items_scored": len(bench_parts),
            "items_unlabelled": unlabelled,
            "items_failed": failed,
            "rule_findings_dropped": predictor.dropped,
            "pixel_element_sources": pixel.source_counts if pixel else None,
            "pixel_needs_review_excluded": pixel.needs_review_excluded if pixel else None,
            "strata": STRATA,
        },
        "metrics": aggregate(results),
        "coverage": {
            "rule_only": {"scs_with_verdict": len(COVERED_SCS), "scs": COVERED_SCS},
        },
    }
    metrics["bootstrap"] = bootstrap(results, cfg.conditions, all_scs, cfg.bootstrap, cfg.seed)
    if len(cfg.conditions) >= 2:
        metrics["mcnemar"] = run_mcnemar(
            results, cfg.conditions[0], cfg.conditions[1], all_scs, STRATA
        )
    else:
        metrics["mcnemar"] = {"note": "single condition: no paired comparison"}
    sensitivity = _sweep(sweep_inputs)
    cfg.out.mkdir(parents=True, exist_ok=True)
    (cfg.out / "metrics.json").write_text(json.dumps(metrics, indent=1, sort_keys=True) + "\n")
    (cfg.out / "VERSIONS.json").write_text(
        json.dumps(run_versions, indent=2, sort_keys=True) + "\n"
    )
    (cfg.out / "tables.md").write_text(tables.markdown(metrics))
    (cfg.out / "tables.tex").write_text(tables.latex(metrics))
    metrics["failure_rows"] = failures_mod.write_failures(
        cfg.out / "failures.csv", results, features
    )
    (cfg.out / "sensitivity.csv").write_text(sensitivity)
    return metrics


def _sweep(inputs: list[tuple[ItemTruth, str, Prediction]]) -> str:
    match = protocol.load().thresholds.match
    lines = ["rule,iou,condition,sc,tp,fp,fn,duplicates,precision,recall"]
    for use_containment, label in ((False, "iou-only"), (True, "iou-or-containment")):
        for iou_t in SWEEP_IOU:
            results: list[UnitResult] = []
            cfg = MatchConfig(iou_t, match.containment, use_containment)
            for truth, cond, pred in inputs:
                results += [r for r in score_item(truth, pred, cond, cfg) if r.key is None]
            for cond, strata in aggregate(results).items():
                for sc, c in strata["combined"].items():
                    p = "" if c["precision"] is None else f"{c['precision']:.4f}"
                    r_ = "" if c["recall"] is None else f"{c['recall']:.4f}"
                    lines.append(
                        f"{label},{iou_t},{cond},{sc},{c['tp']},{c['fp']},{c['fn']},{c['duplicates']},{p},{r_}"
                    )
    return "\n".join(lines) + "\n"
