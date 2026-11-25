# Changelog

Dates are build days of the Mane Maarga Master Plan v2. Each line names what changed and how it was checked.

## Day 4 · 25 Nov 2026 · The agent loop
- `app/agents/runtime.py`: PLAN, ACT, CHECK, RECOVER, ASK, DONE, at most 12 steps. The model returns one JSON decision per turn; the server runs every tool.
- Providers: `mock` (YAML scripts, figures filled only from tool results) and `lyzr` (Lyzr Agent Studio inference API, 2 retries). Unconfigured Lyzr gives a clear 400.
- Citation guard: a message reaches the operator only if every rupee figure comes from a tool result or a cited clause, every cited clause exists, and both English and Kannada are present. Two failures block the run.
- `agent_runs` and `agent_steps` tables (Alembic 0003); `POST /api/cases/{id}/agent/run`, `GET /api/cases/{id}/agent/runs`.
- System prompt in English and Kannada (`app/agents/prompts/`). `make demo` prints three traces with no key: happy path, recovery, blocked.
- 7 new tests (happy path, recovery, blocked figure, step limit, no self-approval, Lyzr retries): 97 passing.

## Day 3 · 24 Nov 2026 · Tools, not prompts
- Tool registry (`app/agents/tools/`): 11 typed tools, each declaring its side effect (`none`, `write` or `gated`). Every call is validated and audited with argument and result hashes and milliseconds.
- `request_approval` is the only gated tool; it creates a pending `approval_requests` row (Alembic 0002). Only `POST /api/approvals/{id}/decide` by an administrator changes a case's status.
- `GET /api/tools/openapi.json` and `POST /api/tools/{name}` behind `X-Service-Token` (closed when `MANE_MAARGA_SERVICE_TOKEN` is unset).
- `app/agents.py` became the `app/agents/` package; behaviour unchanged.
- 13 new tests, including one that calls every write and gated tool and proves status and money are untouched: 90 passing.

## Day 2 · 23 Nov 2026 · Rules with receipts
- Rule pack v2 at `rules_data/KA/pmayg/2024-25.json`: 17 clauses, each with an ID, English and Kannada text, and a source (PIB, Lok Sabha, CAG). Clauses from secondary sources are marked unverified, and the stage split stays illustrative.
- JSON Schema plus `make rules-lint` (also in CI): fails on a missing https source, missing Kannada, bad clause IDs, stage shares that don't sum to 1, or undeclared facts.
- Loader picks the pack in force on a date; eligibility is JSON-logic evaluated in code; missing facts give `needs_information`.
- New: `POST /api/engine/eligibility`, `GET /api/engine/clauses/{id}`; the ladder now returns its clause IDs. Route fixture updated by exactly these two routes.
- 17 new tests (one per exclusion, boundaries, dates, endpoint): 77 passing. `PROBLEM.md` added.

## Day 1 · 22 Nov 2026 · Clean the house
- `main.py` split into routers under `app/api/` and shared code under `app/core/`; all 49 routes unchanged (`tests/test_routes.py`).
- Makefile, ruff, mypy, ESLint and pre-commit; lint, type-check and benchmarks run in CI.
- Fixed: money-ladder labels (peak cash vs timing gap), the recovery check missing "no documents / no estimate / no stages", a subsidy counted twice in the case check, the overview gap label, English strings in Kannada mode, and the demo copying rule-pack numbers.
- Found by lint: a duplicated test name meant one security-header test never ran.
- PHASE install notes moved to `docs/history/`; asset folders merged; "Sooru" names replaced (old `SOORU_*` variables still read).
- `ARCHITECTURE.md` and ADRs 0001–0003.
