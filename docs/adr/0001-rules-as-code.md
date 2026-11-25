# ADR 0001 — Rules as code

**Status:** accepted · 22 Nov 2026

## Context
Housing assistance depends on rules that change by state and budget year: unit assistance, loan limits, exclusion criteria, instalment stages. A family is harmed if we state a wrong amount or a wrong verdict, and judges will ask where every number comes from.

## Decision
Every rule lives in a dated JSON rule pack per state, scheme and budget year, under `backend/app/engine/rules_data/`. Each clause has an ID, English and Kannada text, machine-readable logic and a source (title, URL, locator, date accessed). Plain Python in `engine/` evaluates the packs. A loader picks the pack in force on a given date. A lint step fails the build when a clause has no source URL or no Kannada text.

## Alternatives considered
- **Hard-coding rules in Python.** Fast to start, but every change is a code change, sources get lost, and a second state means copying logic.
- **Letting a language model read the guidelines and answer.** Flexible, but it can invent amounts and clauses, and its answers cannot be audited.

## Consequences
- A new budget year or state is a data change with a citation, reviewable by someone who does not write Python.
- Facts that are not yet confirmed from an official order (for example Karnataka's stage-wise instalment split) must be flagged as unverified in the pack and on screen.
- The frontend demo reads the same pack (synced and checked in CI), so the two cannot drift.
