# ADR 0003 — Approval gate

**Status:** accepted · 22 Nov 2026

## Context
The brief requires that the family approves every submission and payment. A prompt instruction such as "always ask first" can be bypassed by a confused model, a malicious instruction hidden in an uploaded document, or a bug.

## Decision
- Gated actions are listed in a policy file (submit to a portal, request a tranche, accept a loan, pay any amount, change case status, share documents with a third party).
- A gated tool may only create a **pending approval** row with a payload hash and a plain-language summary in Kannada and English. It never executes.
- A single **executor** is the only code path that runs a gated action. It re-hashes the payload, requires an approved, unexpired approval, runs the action exactly once and marks it executed.
- Approval needs the family for money, submissions, loans and sharing documents: a one-time code (stored as an HMAC, 5-minute expiry, 3 attempts), later combined with a spoken challenge. Staff cannot approve these on the family's behalf.
- A case-status change is an internal step, so an administrator approves it instead (amended 26 Nov 2026).
- External effects (portal, payment, sharing, SMS) are written to a Simulated outbox until real channels are connected.
- Text from documents and messages is wrapped as untrusted data and never treated as instructions.

## Alternatives considered
- **Approval enforced only in the UI.** Any API caller or agent could skip it.
- **Approval by the case worker alone.** Faster, but it removes the family's consent, which the brief requires.

## Implementation (26 Nov 2026)
`backend/app/policies/gated_actions.yaml`, `app/approvals/` (policy, service, executor), `app/channels/` (otp, outbox), `app/agents/guards/injection_guard.py`, migration `0004_approval_gate`, tests in `tests/test_approvals.py`.

## Consequences
- Tests can prove that no gated action changes money or case status without an approval, and that an approval cannot be replayed.
- Every gated action has an audit trail a bank or auditor can check.
