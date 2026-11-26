# Changelog

Dates are build days of the Mane Maarga Master Plan v2. Each line names what changed and how it was checked.

## Site · 26 Nov 2026 · Less crowded, and the unique parts up front
- Landing redesigned: the Kannada line leads the hero; a new "What only Mane Maarga does" section gives each of six ideas its own row with a real piece of the product (computed money ladder, a cited clause, the family's OTP screen, a blocked invented figure, the recorded Kannada voice, a red-pen RTC mismatch). The journey is one row of growing houses; safeguards are "What it will never do".
- App-wide: Anek's width axis at 106%, 16px base text, larger labels and small text, no all-caps labels, roomier panels and gaps.
- Intelligence notice updated now that the agent runtime exists. README screenshots retaken.

## Day 5 · 26 Nov 2026 · The approval gate, for real
- `policies/gated_actions.yaml`: submit to portal, request a tranche, accept a loan, pay any amount and share documents need the family; a case-status change needs an administrator.
- Approval requests carry a payload hash and plain summaries in Kannada and English with rupees and recipient. `app/approvals/executor.py` is the only place gated actions run: it re-hashes the payload, needs an approved and unexpired request, and claims it with one conditional update so it runs exactly once. Every refusal is audited.
- 6-digit OTP stored as an HMAC, 5-minute expiry, 3 attempts, sent through a Simulated SMS outbox. Family links are hashed tokens that can be rotated. Staff cannot approve money on a family's behalf.
- Injection guard: document and message text reaches the model as `<untrusted_data>`, and instruction-like phrases are flagged in the run trace and audit log.
- Family page `/#/approve/{token}`: Kannada first, large type, read aloud, I agree → code → done. Case file Approvals panel with the outbox; in demo mode the simulated SMS pops up on a phone preview.
- Migration 0004; 11 new tests (bypass, expired code and approval, replay, tampered payload, rejection, link rotation, injection): 113 passing.

## Voice, part 3 · 25 Nov 2026 · The Kannada questions now have a warm voice
- All eight Kannada intake questions are recorded with Indic Parler-TTS (AI4Bharat), speaker Anu, rendered in Colab with a tone set for each line. They are loudness-normalised for phone speakers and play before any live synthesis, including in the hosted demo with no keys.

## Voice, part 2 · 25 Nov 2026 · Bhashini on the live demo and an expressive voice
- Vercel functions (`frontend/api/speech/status|tts|asr`) bring Bhashini to the hosted demo with no backend. Keys are Vercel environment variables; the functions only answer the site's own pages and are rate-limited.
- `scripts/render_voice_prompts.py` renders the fixed intake questions once with Indic Parler-TTS, with the tone described per line (warm greeting, patient questions, grateful thanks). The audio ships with the site and plays before any live synthesis.
- Safari: a clear message that it cannot recognise Kannada speech on its own, instead of "voice input failed".

## Voice · 25 Nov 2026 · Bhashini and a more human Kannada voice
- Bhashini client (`app/speech/bhashini.py`): config call, then ASR or TTS compute. Keys stay on the server; config is cached for an hour and spoken questions are cached. `POST /api/speech/tts`, `POST /api/speech/asr` (16 kHz WAV, about 1 minute maximum), `GET /api/speech/status`.
- The voice now sounds less machine-made: TTS at 22.05 kHz instead of 8 kHz, female or male voice, slightly slower playback, and text spoken the way people say it (no brackets or slashes, rupees read as a word). Kannada is never read with an English voice. Recordings by a real person play first when present (`docs/voice.md`).
- Kannada intake questions rewritten in everyday spoken Kannada, without English words like "case", "prototype" or "skip". Spoken phone answers in Kannada digits and "ಬೇಡ" are understood.
- The browser records the answer as 16 kHz mono WAV for Bhashini; it falls back to the browser's own recognition when Bhashini is not connected.
- 5 new tests: 102 passing.

## Site · 25 Nov 2026 · Ink, Lime and Laterite
- Fonts: Anek Latin and Anek Kannada for the interface, Tiro Kannada for formal Kannada, IBM Plex Mono for figures and clause IDs (Fraunces, Manrope and Noto removed).
- Semantic colour tokens (lime, charcoal, laterite, neem, stamp, redpen, turmeric), a 13–64 px type scale, Kannada line height 1.7, and a high-contrast sunlight mode. Old token names stay as aliases.
- Ledger kit: `LedgerTable`, `Stamp`, `RedPen`, `Footnote`, `InkRung`; dev-only reference sheet at `#/kit`. The money ladder now stamps the clauses behind its amounts.
- Agent run panel in Intelligence (also in browser demo mode) showing each step and the guarded answer in English and Kannada.
- `npm run lint:style` in CI: no hype words, emoji, smooth gradients, glass blur or sparkles icon, and every English string has Kannada. Removed the blur effects and shimmer it found.
- `lib/money.ts` formatINR with Indian grouping; README screenshots retaken.

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
