# Changelog

Dates are build days of the Mane Maarga Master Plan v2. Each line names what changed and how it was checked.

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
