# Sooru release checklist

- [ ] Backend tests pass in CI and locally.
- [ ] Frontend TypeScript build passes.
- [ ] Docker Compose dev stack builds and health checks pass.
- [ ] Database migration upgrade passes against a fresh DB and a copy of a legacy DB.
- [ ] Auth bootstrap is disabled after first admin creation; operator/viewer permissions checked.
- [ ] Consent withdrawal and audit trail checked.
- [ ] Upload type/size/signature limits checked; uploaded files remain private.
- [ ] Agent and budget outputs show prototype disclaimers and require human review.
- [ ] Production secrets are unique and stored in secret manager; no `.env` in Git.
- [ ] Exact CORS origins and HTTPS configured.
- [ ] Backup and restore tested, including private upload volume.
- [ ] Error logs, request IDs, health checks and external monitoring configured.
- [ ] Privacy/consent text reviewed by qualified local counsel and translated.
- [ ] Scheme information independently verified; no eligibility/credit/payment decision automated.
- [ ] Security review and pilot approval completed.
