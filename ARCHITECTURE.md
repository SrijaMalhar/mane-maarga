# Architecture (v0)

This describes the code as it is today. It will change as the agent runtime, approval gate and lender pieces land; each change is recorded in `docs/adr/`.

## The rule we build around

**Code decides every rule and every rupee.** Eligibility, the money ladder, the 30% repayment cap and stage costs come from plain Python in `backend/app/engine/`, reading dated JSON rule packs. Language models may choose which tool to call and explain the result; they never compute money or eligibility, and nothing is submitted or paid without the family's approval.

## Folders

```text
backend/
├── app/
│   ├── main.py            app factory: middleware + routers (≈40 lines)
│   ├── api/               one router per area
│   │   ├── system.py      /health, /ready, /metrics, /api/system/version
│   │   ├── auth.py        sign-in, first-admin bootstrap, users
│   │   ├── cases.py       cases and consent
│   │   ├── documents.py   upload, download, extraction, reviewer verification
│   │   ├── finance.py     funding sources, finance summary, budget, scheme catalogue
│   │   ├── construction.py stages and photo evidence
│   │   ├── intelligence.py case checks, intake, scheme reference, tasks, evaluations
│   │   ├── audit.py       audit trail (admin)
│   │   └── engine.py      /api/engine/ladder, /api/engine/affordability
│   ├── core/              config (env), security (tokens, roles, throttle), audit writes, observability
│   ├── engine/            rules.py, ladder.py, affordability.py + rules_data/ (dated packs)
│   ├── agents.py          four rule-based case checks (documents, finance, construction, recovery)
│   ├── document_ai.py     text extraction (pypdf, Tesseract) and field comparison
│   ├── models.py          SQLAlchemy tables
│   └── schemas.py         Pydantic request/response models
├── alembic/               migrations
├── benchmarks/            MaargaDocBench (synthetic document benchmark) + results/
└── tests/                 API, engine, agents, routes, benchmark
frontend/
├── src/pages/             one screen per route
├── src/components/        shell, drawings, shared UI
├── src/lib/               API client, i18n (en/kn), demo mode, formatting
└── src/generated/rules/   rule packs synced from the backend (checked in CI)
```

## How a request flows

1. The browser calls the API with a bearer token (`core/security.py`). Roles: admin, operator, viewer.
2. A router validates input with Pydantic, reads or writes through SQLAlchemy, and writes an audit row for every change (`core/audit.py`).
3. Money and eligibility questions go to `engine/`, which loads the rule pack in force for the date and state.
4. Every response carries a request ID and security headers (`core/observability.py`).

## What is real and what is simulated today

| Part | Status |
|---|---|
| Cases, consent, documents, funding, stages, audit | Real, stored in PostgreSQL |
| Text extraction and field comparison | Real (`pypdf`, Tesseract); scored by MaargaDocBench |
| Money ladder, 30% repayment cap | Real code; the stage split is illustrative until the official order is found |
| Case checks | Rule-based, deterministic; no language model yet |
| Demo mode in the browser | Sample data only, labelled; uses the same rule pack |
| Government portals, banks, payments | Not connected; any future connector will be a labelled simulator first |

## Decisions

- [ADR 0001 — Rules as code](docs/adr/0001-rules-as-code.md)
- [ADR 0002 — Agent runtime](docs/adr/0002-agent-runtime.md)
- [ADR 0003 — Approval gate](docs/adr/0003-approval-gate.md)
