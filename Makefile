SHELL := /bin/bash
-include .env
export

BENCHMARK_DIR ?= ../04_Data_Collection/benchmark_captures
TRUTH_PATH ?= ../04_Data_Collection/annotation/benchmark_ground_truth.json

.PHONY: check smoke eval eval-secondary stability goldens gen-types test-browser

check:
	uv run ruff check .
	uv run ruff format --check .
	uv run mypy packages services
	uv run pytest -q
	pnpm -C apps/web lint
	pnpm -C apps/web test

smoke:
	bash scripts/smoke.sh

CONDITIONS ?= rule_only,pixel,hybrid
EVAL_OUT ?= eval/$(shell date +%F)

eval:
	uv run auditor eval --benchmark $(BENCHMARK_DIR) --truth $(TRUTH_PATH) --synthetic-truth from-folders \
		--conditions $(CONDITIONS) --seed 20261004 --bootstrap 10000 --calibration \
		$(if $(RULE_FINDINGS),--rule-findings $(RULE_FINDINGS)) --out $(EVAL_OUT)
	uv run python scripts/eval_figure.py $(EVAL_OUT)
	uv run python scripts/failure_taxonomy.py $(EVAL_OUT)
	uv run python scripts/calibration_figure.py $(EVAL_OUT)

RING_EXEMPT_PROTOCOL = data/protocol_ring_exempt.yaml
EVAL_ARGS = --benchmark $(BENCHMARK_DIR) --truth $(TRUTH_PATH) --synthetic-truth from-folders \
	--conditions $(CONDITIONS) --seed 20261004 --bootstrap 10000

eval-secondary:
	mkdir -p data $(EVAL_OUT)/secondary/automated_only $(EVAL_OUT)/secondary/ring_exempt
	[ ! -d $(EVAL_OUT)/rule_cache ] || cp -R $(EVAL_OUT)/rule_cache $(EVAL_OUT)/secondary/automated_only/
	[ ! -d $(EVAL_OUT)/rule_cache ] || cp -R $(EVAL_OUT)/rule_cache $(EVAL_OUT)/secondary/ring_exempt/
	sed 's/ua_default_ring_exempt: false/ua_default_ring_exempt: true/' packages/auditor/auditor/protocol.yaml > $(RING_EXEMPT_PROTOCOL)
	uv run auditor eval $(EVAL_ARGS) --automated-only --out $(EVAL_OUT)/secondary/automated_only
	AUDITOR_PROTOCOL=$(RING_EXEMPT_PROTOCOL) uv run auditor eval $(EVAL_ARGS) --include-needs-review --out $(EVAL_OUT)/secondary/ring_exempt

stability:
	uv run auditor stability --benchmark $(BENCHMARK_DIR) --out $(EVAL_OUT)

goldens:
	uv run python scripts/regen_goldens.py

gen-types:
	uv run python -m app.openapi data/openapi.json
	pnpm -C apps/web gen:types

test-browser:
	REQUIRE_BENCHMARK=1 uv run pytest packages/auditor -m browser -q
