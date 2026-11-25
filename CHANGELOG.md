# Changelog

Dates are build days of the Mane Maarga Master Plan v2. Each line names what changed and how it was checked.

## Day 1 · 22 Nov 2026 · Clean the house
- `main.py` split into routers under `app/api/` and shared code under `app/core/`; all 49 routes unchanged (`tests/test_routes.py`).
- Makefile, ruff, mypy, ESLint and pre-commit; lint, type-check and benchmarks run in CI.
- Fixed: money-ladder labels (peak cash vs timing gap), the recovery check missing "no documents / no estimate / no stages", a subsidy counted twice in the case check, the overview gap label, English strings in Kannada mode, and the demo copying rule-pack numbers.
- Found by lint: a duplicated test name meant one security-header test never ran.
- PHASE install notes moved to `docs/history/`; asset folders merged; "Sooru" names replaced (old `SOORU_*` variables still read).
- `ARCHITECTURE.md` and ADRs 0001–0003.
