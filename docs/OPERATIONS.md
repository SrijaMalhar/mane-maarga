# Operations runbook

## Health checks

- `GET /health`: process liveness, no database dependency.
- `GET /ready`: database readiness; returns 503 when the database is unavailable.
- `GET /api/system/version`: version and environment metadata.
- `GET /metrics`: simple in-process HTTP request counters. It is not Prometheus-complete, has no persistence, and should be network-restricted.

## Logs

The API emits one JSON request log with request ID, method, path, status and duration. Error logs include request ID and route context. Do not log beneficiary names, phone digits, documents, tokens, or request bodies.

## Backup and restore

Run `scripts/backup.sh` with the production Compose environment. Store backups off-host and encrypt them. For a restore, use a disposable/test database first:

```bash
gzip -dc backups/mane-maarga-db-YYYYMMDDTHHMMSSZ.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Uploaded evidence/documents live in a separate named volume and must be backed up independently. Validate restore integrity and document recovery time/objectives before pilot use.

## Incident checklist

1. Preserve logs and the request ID associated with the incident.
2. Check `docker compose -f docker-compose.prod.yml ps` and API `/ready`.
3. Inspect service logs, without exporting secrets or beneficiary data.
4. Stop unsafe workflows if consent, document integrity, or approval-gate behavior is affected.
5. Restore only after diagnosis and a reviewed recovery plan.

## Prototype limits

In-memory login throttling and metrics are per process and reset on restart. They are not a substitute for a gateway/WAF, distributed rate limiting, external monitoring, or audit retention. Uploads are not malware-scanned or encrypted at rest by the app. Production deployment requires those controls and a privacy/security assessment.
