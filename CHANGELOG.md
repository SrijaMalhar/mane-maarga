# Changelog

Dates are build days of the Mane Maarga Master Plan v2. Each line names what changed and how it was checked.

## Plot map and family page · 28 Nov 2026 · Where the house is, and the family watching it go up
- **Plot map** on Construction: Leaflet with satellite (Esri World Imagery) and street (OpenStreetMap) tiles, the plot pin, the 150 m and 1 km rings the photo checks use, and every site photo where its GPS says it was taken, numbered by stage; a photo far from the plot gets a line back to the pin, and tapping one opens the review dialog. Beside it: the plot's **DIGIPIN**, the survey number and extent from the land record, coordinates and directions. Editors move the pin by tapping, dragging or "Use my location"; the move says how far it went and how many photos were already accepted against the old pin, and is audited. Leaflet loads only with the map (its own 46 KB gzip chunk).
- **DIGIPIN** (`src/lib/digipin.ts`) is ported from India Post's reference code (Apache-2.0, May 2026 format: 10 characters, no hyphens, shown 3-4-3). Checked against their published vector (13.11179621, 80.20264269 → 4T396F42L7) and against the reference implementation on 200,000 random points across India, encoding and decoding.
- **Family progress links** (`backend/app/api/progress.py`, migration `0008_progress_links`): one revocable, read-only link per case. It needs consent on record and pauses at once if consent is withdrawn. The token is an HMAC of a stored nonce with the server secret, so staff can show it again while the database alone cannot open a page. Photos are re-encoded on the way out (no GPS, time or camera details). Views count visits, not refreshes, and a signed-in staff preview is not a visit. The link can go out as a simulated Kannada and English SMS through the outbox (`MANE_MAARGA_PUBLIC_APP_URL`). Six new routes, added to the route fixture on purpose.
- **The family's page** (`#/progress/<token>`): Kannada first, large type, no login. How much is built (the same house drawing), what is happening now in one sentence, each stage with the day it was done and its accepted photos, then and now (drag between the first and latest photo), the plot with its DIGIPIN and directions unless staff left the map off, and sharing by WhatsApp. It refreshes every 30 seconds while open, greets the family with what is new since they last looked, keeps the last copy for when the network drops and wipes it when the link is switched off. Listen reads it aloud in Kannada; Sunlight turns on the high-contrast palette. It says when the next instalment can be asked for but shows no amounts, because the stage split is still illustrative.
- **Sharing it** from Construction: a QR code the family scans on the spot (decoded back to the exact link with OpenCV to check it), copy, WhatsApp, simulated SMS, how often it was opened, a phone-frame preview, new link and switch off, each confirmed first.
- **Site visits**, a second view on Construction: every pinned plot on one map with what it needs today (on site, visit, at your desk) and the shortest order to see the ones ticked, from the officer's location if shared. Exact up to 12 plots (Held-Karp), nearest neighbour and 2-opt beyond; matched brute force on 300 random days. The route opens in Google Maps by two-wheeler, car or on foot, split into parts of nine stops (three on a phone browser).
- Also: nginx allows the two tile hosts and geolocation for the site (the case form's "Use my location" needed it too); the demo returns a photo's GPS and time on the first load, as the API does; a family link pasted into an open tab now opens the family's page.
- Tests: 12 new (consent first; token never stored; verified progress only and nothing private on the page; accepted photos lose their EXIF; another family's photo is refused; map can be left out; visits not refreshes; staff preview not counted; a new link switches the old one off; switching off is permanent and audited; withdrawn consent pauses the page; the SMS). 139 pass; ruff, mypy, rules-lint, ESLint, style lint and build pass. Checked in the browser at 1440px and 390px, in the demo and against the real API (offline copy, switched-off link, CORS).

## Guided tour · 27 Nov 2026 · One family, nine steps
- A guided tour (`#/tour`, "Follow one family from first visit to keys" on the landing page, and Guided tour in the demo menu) walks through the whole process: the problem in Karnataka, a Kannada home visit, consent, papers checked, the money ladder, the family's one-time code, site photo checks, the flight recorder, and keys.
- Each step has its own illustration (`src/components/TourArt.tsx`, nine SVG scenes in the app palette) and the real figures behind it, read from the cited rule pack and public dataset rather than typed in: ₹1,20,000 unit assistance (AM-01), first instalment within 7 working days of sanction (TM-01), loan up to ₹70,000 at 3 points lower interest (AM-02, AM-03), ₹12,000 toilet (AM-04), 25 sq m minimum (AM-05), eligibility and exclusion rules (EL-01, EX-01), and Karnataka's 5,20,862 sanctioned / 1,58,520 finished (Lok Sabha Q. 3722). A missing clause ID fails loudly.
- "Show me in the app" opens the real page for the step; a tour bar follows across pages, rings the relevant part and links to the next step. Keyboard arrows move between steps; motion respects reduced-motion.
- README: a tour GIF (33 s) under the main demo. Checked at 1440px and 390px; tsc, ESLint, style lint and build pass.

## Site photos, part 2 · 27 Nov 2026 · Where, when, and seen before
- Each site photo is read on upload for its capture time and GPS (EXIF), and fingerprinted as a 16×16 grey thumbnail. `backend/app/photo_checks.py` turns these into three checks for the reviewer: **where** (distance from the case's plot pin: at the plot ≤150 m, nearby ≤1 km, flagged beyond), **when** (flagged if taken more than 30 days before upload, in the future, or with no time) and **used before** (another photo on file closer than 0.06 RMS after normalising; both photos then show the warning).
- Fingerprint chosen by measurement: a 64-bit difference hash put two different families' photos 4 bits apart, too close to a re-upload. The normalised thumbnail scores a resized, recompressed copy at about 0.02 and the closest two different photos at 0.13. It does not catch a cropped copy; the README says so.
- Accepting a photo with any warning needs a written reason; it is stored with the review and in the audit trail (`accepted_despite=…`).
- Cases have an optional plot pin (`plot_lat`, `plot_lon`), with "Use my location" in the case form. Migration `0007_photo_checks`.
- Review dialog: the three checks, a distance ring (plot at the centre, 150 m and 1 km rings, the photo's position), and the matching photo shown beside the new one. Stages with a flagged photo say "Review: 3 warnings".
- Demo: twelve drawn sample photos (three plots × four stages), each with GPS for its plot written into the file; the browser reads the EXIF and fingerprints the image itself (`src/lib/photo-check.ts`). **Problem photo** sends another family's old photo to show all three warnings.
- Tests: 6 new (EXIF read; clean photo has no warnings; far and old photos flagged; the same picture for two families caught on both, accept refused without a reason; a resized copy matches while a different photo does not; no plot pin means no location flag). 127 pass.

## Site photos · 27 Nov 2026 · A person checks every stage
- Site photos are now shown and reviewed, not just stored. `GET /api/construction-evidence/{id}/file` serves a photo to signed-in users; `PATCH /api/construction-evidence/{id}/review` records accepted or retake, who reviewed it and when. A retake must say what to show. Migration `0006_photo_review`.
- A stage can be marked verified only after one of its photos is accepted; the API answers 409 otherwise.
- Construction page: thumbnails with their review state, a review dialog (photo, who uploaded it, "Accept the photo" or "Ask for a retake"), and one next step per stage: review the photo, mark verified, or add a photo.
- Demo: "Use a sample photo" adds one of four drawn site photos (plinth, walls, roof, finished house), each labelled as a drawing, not a photo. They are made by `scripts/render_sample_site_photos.py`. Verified stages in the demo carry the accepted photo that allowed them. The demo store key moved to v3 so old sessions reseed.
- Tests: the stage test now checks the 409, upload, file download, retake note, accept and verify. 121 pass. Checked in the browser at 1360px and 390px.

## Day 6 · 27 Nov 2026 · The flight recorder
- Every agent step is sealed: `seal = sha256(previous seal + canonical step)`, from a genesis of zeros; the run's outcome (status, message, citations) is sealed last. Migration `0005_flight_recorder` adds the columns; runs from before it show as unsealed.
- `GET /api/agent/runs/{id}/recording` returns the run with each tool's side effect, the rule pack in force and a fresh check of the chain: intact, or broken at the first changed step or at the outcome.
- `POST /api/agent/runs/{id}/replay` runs each recorded read-only tool again with its recorded arguments and compares the result field by field. Tools that write or need approval are never re-run, and the replay transaction is rolled back. The replay itself is audited.
- A new Flight recorder page: the run as a tape of phases with chain links between steps, play and step-through (arrow keys), the call and result of each step with its seal, replay results on the tape, and JSON export. In the demo, "Edit a stored figure" breaks the seal on purpose to show detection.
- Tests: 7 new (sealed and verifies; an edited step breaks at that step; an edited outcome breaks; replay reproduces reads; replay finds the field that changed after the case changed; replay never re-creates a task; 404s). 121 pass. Checked in the browser at 1360px and 390px.

## Site, part 2 · 26 Nov 2026 · Pages that answer first
- The landing page is back to its original design, with one new section: the recorded Kannada intake questions play as a short conversation, the current line highlighted with its English meaning and a live waveform.
- Overview, Financial planning and Verification each open on one sentence that answers the page's question: how many families need a decision today; the cash a family needs before its next instalment; how many fields differ from the case file. Supporting figures sit beside it.
- Overview: one action per family (record consent, plan the gap, add an estimate); money and activity in a side column; the Karnataka figures as one line.
- Financial planning: opens on a family with an estimate; the money ladder is full width, seeded from the family's recorded savings and loans, with the tightest stage marked. Sources are a table; the repayment check folds away.
- Verification: the document-vs-case-file comparison is the main view, mismatches in red pen, decision buttons under the answer; the preview folds away.
- Checked with screenshots at 1440px and 390px; tsc, ESLint, style lint and build pass. README screenshots retaken.
- README: a new GIF tells one family's story in four Kannada chapters (ask, check, plan, approve), with the money ladder recomputing live as savings and the scheme loan are typed. The six full-app screenshots are replaced by three focused crops, one per page.
- The voice conversation scrolls only its own box, never the page; ladder bars animate when amounts change (off under reduced motion). The demo no longer flags "(sample)" in a family's name as a document mismatch.

## Data · 26 Nov 2026 · Real public figures in the demo
- `backend/app/public_data/ka_pmayg_progress.json`: Karnataka and all-India PMAY-G targets, sanctions and completions from Lok Sabha Q.3722 (as on 7 Aug 2025), Q.428 (17 Jul 2025), Q.931 (9 Dec 2022) and PIB (Mar 2025), each with its link. Served at `GET /api/public-data/pmayg/karnataka` with derived figures computed in code.
- The landing page and the overview lead with it: 3,62,342 sanctioned houses in Karnataka not yet finished; 30.4% completion against 73.4% across India; sanctions growing faster than completions.
- The demo is labelled honestly: real figures, rules and villages, invented families. New README GIF recorded from the running app.

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
