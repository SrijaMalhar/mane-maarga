# The problem, and where each part is answered

Each row goes from the problem to the evidence behind it, then to the feature that answers it and where a judge can see that feature. Rule numbers come from the cited rule pack at `backend/app/engine/rules_data/KA/pmayg/2024-25.json`. Each clause in that pack carries its source, its locator and the date it was accessed.

| Problem | Evidence | Feature | Where to see it |
|---|---|---|---|
| A family gets ₹1.20 lakh, but it arrives in stages, after the work is verified. Bills come due before each instalment. | Unit assistance (`KA-PMAYG-2024-25:AM-01`, Lok Sabha AU1336). Release on stage verification (PMAY-G FFI). | **Money ladder**: shows, stage by stage, the cash needed before each instalment and the largest timing gap. | Financial planning tab; `POST /api/engine/ladder`; `backend/app/engine/ladder.py` |
| Help that exists goes unclaimed: a ₹70,000 loan at 3 points less interest, ₹12,000 for a toilet, 90 days of MGNREGS wages. | `AM-02`, `AM-03`, `AM-04`, `AM-06` (PIB backgrounder, 19 Nov 2024) | Funding sources kept apart as confirmed, proposed or estimated, each with its clause. | Financial planning; `GET /api/engine/clauses/{id}` |
| Families are wrongly excluded or included because the rules are applied by hand. The exclusion list changed in 2024 (13 criteria became 10, and the income limit rose to ₹15,000). | `EX-01`…`EX-08` (PIB backgrounder, 19 Nov 2024). Rules taken only from news reports are marked `verified: false`. | **Eligibility check**: every rule is code with a clause ID. A missing fact gives "needs information", never a guess. | `POST /api/engine/eligibility`; `backend/tests/test_rules.py` (one test per exclusion) |
| The first instalment is late. | It is due within 7 working days of sanction (`TM-01`, CAG Report 8 of 2025, citing FFI 5.4.1). | Case timeline and the "needs attention" list. | Overview; case file |
| Document mismatches (a village name, a survey number) stall cases for weeks. | Our MaargaDocBench v0: 120 synthetic documents. | Verification desk: extraction suggests, a reviewer decides, and every mismatch is flagged. | Verification desk; `make eval` |
| Rules change every budget year, and a stale number does real harm. | Packs are dated (`effective_from`, `effective_to`). | Loader picks the pack in force on the date; `make rules-lint` blocks a clause without an https source or Kannada text. | `backend/app/engine/rules.py`; CI step "Rule packs" |

**Known gaps, stated openly.** Karnataka's split of cost and instalments across stages is illustrative (`stages.verified: false`) until we obtain the RGRHCL order. The Kannada clause text is awaiting review by a native speaker (`kn_reviewed: false`).
