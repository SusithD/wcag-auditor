SHELL := /bin/bash
-include .env
export

BENCHMARK_DIR ?= ../04_Data_Collection/benchmark_captures
TRUTH_PATH ?= ../04_Data_Collection/annotation/benchmark_ground_truth.json

.PHONY: check smoke eval goldens gen-types test-browser

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
		--conditions $(CONDITIONS) --seed 20261004 --bootstrap 10000 \
		$(if $(RULE_FINDINGS),--rule-findings $(RULE_FINDINGS)) --out $(EVAL_OUT)

goldens:
	uv run python scripts/regen_goldens.py

gen-types:
	uv run python -m app.openapi data/openapi.json
	pnpm -C apps/web gen:types

test-browser:
	REQUIRE_BENCHMARK=1 uv run pytest packages/auditor -m browser -q
