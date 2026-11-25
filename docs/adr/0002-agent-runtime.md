# ADR 0002 — Agent runtime

**Status:** accepted · 22 Nov 2026

## Context
Problem 1.1 is tagged Agentic AI. Cases run for months and involve many parties, so a case manager that plans next steps, calls tools and recovers from setbacks is the core of the product. We also need runs to be reproducible in CI, cheap to test, and impossible to talk into breaking a rule.

## Decision
- A **tool layer** (`app/agents/tools/`) exposes existing engine and database functions as typed tools with Pydantic inputs and outputs. Each tool declares a side effect: `none`, `write` or `gated`.
- A **runtime** loops through PLAN → ACT → CHECK → RECOVER → ASK → DONE with a step limit. The model answers with a JSON action (`{"tool", "args"}`) plus messages in English and Kannada and the clause IDs it relies on. **Our server executes the tool**, so guards and the approval gate always run on our side.
- **Providers** sit behind one interface: `mock` (scripted, deterministic, used in CI and demos) and `lyzr` (Lyzr v3 chat API, keys from the environment).
- A **citation guard** blocks any message about money, eligibility or deadlines that lacks a valid clause ID from the active pack; the runtime retries once, then falls back to a template.
- Every run and step is stored (`agent_runs`, `agent_steps`) for the Flight Recorder.

## Alternatives considered
- **Letting Lyzr call our tools directly over OpenAPI.** Shown as a second integration, but if it were the only path the gate and guards would depend on a remote prompt.
- **A single prompt that writes the whole plan.** Simpler, but untestable, unauditable and unable to recover mid-run.

## Consequences
- The agent can be tested without network or credits; Lyzr is exercised locally and in a capped evaluation run.
- Model output is never trusted for numbers: tools compute, the model explains.
