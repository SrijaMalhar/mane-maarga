# Sooru MVP — Phase 2

A prototype case-management dashboard for housing-support beneficiaries.

## Included
- React + TypeScript + Vite frontend
- FastAPI backend
- PostgreSQL via Docker Compose
- Create, list, search, edit, and delete beneficiary cases
- Case status tracking
- Prototype financing-gap calculation
- API documentation at `/docs`

## Run locally
Prerequisites: Docker Desktop.

```bash
docker compose up --build
```

Open:
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

To stop:
```bash
docker compose down
```

To stop and remove the local database volume (deletes local demo data):
```bash
docker compose down -v
```

## Important prototype limitations
- No authentication or authorization.
- Do not enter real beneficiary personal data.
- Phone numbers are limited to last four digits in this prototype.
- No official government scheme, lender, bank, subsidy, identity, or payment integration.
- Financing-gap calculation is a basic estimate, not eligibility or lending advice.
- No audit log or production-grade security yet.

## Suggested next phases
1. Authentication and role-based access
2. Beneficiary document upload and secure storage
3. Consent and audit trail
4. Scheme-rule configuration and verified source register
5. Finance workflow and affordability checks
6. OCR/document extraction with human review
7. Notifications and operator workflow
