# Mane Maarga developer commands. Run `make help` for the list.
PY ?= python3
BACKEND := backend
FRONTEND := frontend

.PHONY: help dev down test lint fmt typecheck eval seed demo build

help:  ## Show this list
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  %-12s %s\n", $$1, $$2}'

dev:  ## Start the full stack (API, database, web) with Docker
	docker compose up --build

down:  ## Stop the stack; data volumes are kept
	docker compose down

test:  ## Run backend tests and the frontend type-check and build
	cd $(BACKEND) && $(PY) -m pytest -q
	cd $(FRONTEND) && npm run build

lint:  ## Lint and type-check backend and frontend
	cd $(BACKEND) && ruff check app tests benchmarks && ruff format --check app tests benchmarks && mypy
	cd $(FRONTEND) && npm run lint

fmt:  ## Auto-format backend code
	cd $(BACKEND) && ruff check app tests benchmarks --fix && ruff format app tests benchmarks

eval:  ## Run every benchmark and write results to backend/benchmarks/results/
	mkdir -p $(BACKEND)/benchmarks/results
	$(PY) $(BACKEND)/benchmarks/maargadocbench_v0.py --json $(BACKEND)/benchmarks/results/maargadocbench_v0.json

seed:  ## Fill an empty local workspace with synthetic families (needs USERNAME and PASSWORD)
	$(PY) scripts/seed_demo.py --username "$(USERNAME)" --password "$(PASSWORD)"

build:  ## Production build of the frontend
	cd $(FRONTEND) && npm run build
