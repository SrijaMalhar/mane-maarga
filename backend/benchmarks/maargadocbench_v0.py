#!/usr/bin/env python3
"""MaargaDocBench v0 — an open, synthetic benchmark for Mane Maarga's document checks.

What it measures
----------------
Mane Maarga reads land records (RTC / pahani) and PMAY-G sanction orders, extracts
fields, and compares them with the case record so a reviewer can catch mismatches
*before* an application bounces. This benchmark generates documents with known
ground truth and planted problems, runs the real pipeline in ``app.document_ai``
(``extract_fields`` + ``compare_case``), and reports:

* **Field F1** — micro precision / recall / F1 of extracted fields against ground truth
  (survey_number, village, taluk, extent, beneficiary_name, document_number).
* **Mismatch recall** — of documents whose name, village or taluk really differs from the
  case (a different person or place), the share flagged as a mismatch.
* **Mismatch precision** — of documents flagged, the share that really differ.
* **Variant false-alarm rate** — of documents where the only difference is a spelling
  variant of the *same* person or place (Kudur / Kuduru, Lakshmamma / Laxmamma),
  the share wrongly flagged. Exact comparison is expected to do badly here; this is
  the gap a Kannada-aware name matcher should close.

Results are broken down by condition (clean, OCR noise, missing field, variant, true mismatch).

Everything is generated in code from invented names. No real person's data is used.
The same ``--seed`` always produces the same documents and the same numbers.

Usage (from the repository root or from backend/)::

    python backend/benchmarks/maargadocbench_v0.py                 # 500 documents, seed 7
    python backend/benchmarks/maargadocbench_v0.py --n 2000 --seed 1 --json results.json
    python backend/benchmarks/maargadocbench_v0.py --via-pdf       # also exercise PDF text extraction (needs pypdf)
    python backend/benchmarks/maargadocbench_v0.py --dump-docs out/ # write the generated documents for inspection

Targets from the project plan: field F1 >= 0.90 and mismatch recall >= 0.90.
Targets are goals; only measured numbers should be quoted.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import tempfile
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))  # make `app` importable from anywhere
from app.document_ai import compare_case, extract_fields, normalize  # noqa: E402

VERSION = "0.1.0"
FIELDS = ["survey_number", "village", "taluk", "extent", "beneficiary_name", "document_number"]
COMPARED = ["beneficiary_name", "village", "taluk"]

# ---------------------------------------------------------------------------
# Synthetic world. Place names are real Karnataka villages/taluks used only as
# geography; every person's name is invented and combined at random.
# ---------------------------------------------------------------------------
TALUKS = {
    "Magadi": ["Hosahalli", "Kudur", "Tippasandra", "Solur", "Kalya"],
    "Ramanagara": ["Bidadi", "Kailancha", "Harisandra", "Kootagal"],
    "Kanakapura": ["Harohalli", "Sathanur", "Kodihalli", "Maralawadi"],
    "Channapatna": ["Malur", "Virupakshipura", "Akkur"],
    "Hosakote": ["Nandagudi", "Sulibele", "Anugondanahalli"],
}
GIVEN = [
    "Lakshmamma",
    "Nagaraju",
    "Shivamma",
    "Manjunath",
    "Gowramma",
    "Ravi Kumar",
    "Saroja",
    "Thimmaiah",
    "Kamala",
    "Venkatesh",
    "Puttamma",
    "Siddaraju",
    "Jayamma",
    "Mahadeva",
    "Bhagya",
    "Chikkanna",
    "Rangamma",
    "Hanumanthappa",
    "Yashoda",
    "Basavaraju",
]
INITIAL = ["", "", "K", "M", "G", "B", "D", "R", "S", "N"]

# Same entity, different spelling: how names really drift across offices and transliteration.
VARIANTS = {
    "Kudur": ["Kuduru"],
    "Hosahalli": ["Hosa Halli", "Hosahally"],
    "Tippasandra": ["Tippasandara"],
    "Solur": ["Soluru"],
    "Bidadi": ["Biddadi"],
    "Harohalli": ["Harohally"],
    "Sathanur": ["Satanur", "Sathanuru"],
    "Kodihalli": ["Kodihally"],
    "Sulibele": ["Soolibele"],
    "Magadi": ["Magadai"],
    "Kanakapura": ["Kanakpura"],
    "Lakshmamma": ["Laxmamma", "Lakshamma"],
    "Nagaraju": ["Nagaraj"],
    "Shivamma": ["Sivamma"],
    "Manjunath": ["Manjunatha"],
    "Venkatesh": ["Venkatesha"],
    "Siddaraju": ["Siddaraj"],
    "Thimmaiah": ["Timmaiah"],
    "Basavaraju": ["Basavaraj"],
    "Hanumanthappa": ["Hanumantappa"],
    "Gowramma": ["Gouramma"],
    "Mahadeva": ["Mahadev"],
    "Chikkanna": ["Chikanna"],
}
# OCR confusions seen on scanned forms.
OCR_SWAPS = [("0", "O"), ("1", "l"), ("5", "S"), ("8", "B"), ("a", "o"), ("m", "rn"), ("i", "l")]
CONDITIONS = ["clean", "ocr_noise", "missing_field", "variant", "true_mismatch"]


@dataclass
class Doc:
    doc_id: str
    kind: str
    condition: str
    text: str
    truth: dict  # what the document actually says (extraction ground truth)
    case: dict  # what the case record says
    should_flag: bool  # True only when a compared field truly refers to a different person/place
    planted: str = ""


@dataclass
class Tally:
    tp: int = 0
    fp: int = 0
    fn: int = 0

    def add(self, other: Tally) -> None:
        self.tp += other.tp
        self.fp += other.fp
        self.fn += other.fn

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if self.tp + self.fp else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if self.tp + self.fn else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if p + r else 0.0


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------
def person(rng: random.Random) -> str:
    ini = rng.choice(INITIAL)
    return f"{rng.choice(GIVEN)} {ini}".strip()


def place(rng: random.Random) -> tuple[str, str]:
    taluk = rng.choice(list(TALUKS))
    return rng.choice(TALUKS[taluk]), taluk


def variant_of(value: str, rng: random.Random) -> str | None:
    head, *rest = value.split(" ")
    if head in VARIANTS:
        return " ".join([rng.choice(VARIANTS[head]), *rest])
    return VARIANTS.get(value, [None])[0] if value in VARIANTS else None


def ocr_noise(value: str, rng: random.Random) -> str:
    """One realistic OCR confusion inside the value (never in the label)."""
    options = [(a, b) for a, b in OCR_SWAPS if a in value]
    if not options:
        return value
    a, b = rng.choice(options)
    idx = [i for i, ch in enumerate(value) if value.startswith(a, i)]
    i = rng.choice(idx)
    return value[:i] + b + value[i + len(a) :]


def render(kind: str, f: dict) -> str:
    """Lay the fields out the way the two document types print them."""
    if kind == "land_record":
        lines = ["GOVERNMENT OF KARNATAKA", "RECORD OF RIGHTS, TENANCY AND CROPS (RTC) - SYNTHETIC"]
        if "survey_number" in f:
            lines.append(f"Survey No: {f['survey_number']}")
        if "village" in f:
            lines.append(f"Village: {f['village']}")
        if "taluk" in f:
            lines.append(f"Taluk: {f['taluk']}")
        if "extent" in f:
            lines.append(f"Extent: {f['extent']}")
        if "beneficiary_name" in f:
            lines.append(f"Owner: {f['beneficiary_name']}")
        lines.append("Crop: Ragi")
    else:
        lines = ["PRADHAN MANTRI AWAAS YOJANA - GRAMIN", "SANCTION ORDER - SYNTHETIC"]
        if "document_number" in f:
            lines.append(f"Reference No: {f['document_number']}")
        if "beneficiary_name" in f:
            lines.append(f"Beneficiary: {f['beneficiary_name']}")
        if "village" in f:
            lines.append(f"Village: {f['village']}")
        if "taluk" in f:
            lines.append(f"Taluk: {f['taluk']}")
        lines.append("Unit assistance: Rs 1,20,000")
    return "\n".join(lines)


def generate(n: int, seed: int) -> list[Doc]:
    rng = random.Random(seed)
    docs: list[Doc] = []
    for i in range(n):
        kind = "land_record" if i % 2 == 0 else "scheme_sanction"
        condition = CONDITIONS[i % len(CONDITIONS)]
        name, (village, taluk) = person(rng), place(rng)
        case = {"beneficiary_name": name, "village": village, "taluk": taluk}
        if kind == "land_record":
            truth = {
                "survey_number": f"{rng.randint(1, 240)}/{rng.randint(1, 9)}",
                "village": village,
                "taluk": taluk,
                "extent": f"{rng.choice(['0.05', '0.10', '0.12', '0.20', '1.5'])} acre",
                "beneficiary_name": name,
            }
        else:
            code = taluk[:3].upper()
            truth = {
                "document_number": f"KA-{code}-2025-{rng.randint(1, 9999):04d}",
                "beneficiary_name": name,
                "village": village,
                "taluk": taluk,
            }
        should_flag, planted = False, ""

        if condition == "ocr_noise":
            key = rng.choice([k for k in truth if k != "taluk"])  # noise anywhere except the comparison anchor
            noisy = ocr_noise(truth[key], rng)
            planted = f"{key}: {truth[key]!r} -> {noisy!r}"
            truth[key] = noisy  # the document really prints the noisy text
            # A noisy compared field genuinely disagrees with the case, so a flag is the right call.
            should_flag = key in COMPARED and normalize(noisy) != normalize(case[key])
        elif condition == "missing_field":
            key = rng.choice(list(truth))
            planted = f"{key} missing"
            truth.pop(key)
        elif condition == "variant":
            candidates = [k for k in COMPARED if variant_of(truth[k], rng)]
            if candidates:
                key = rng.choice(candidates)
                v = variant_of(truth[key], rng)
                planted = f"{key}: {truth[key]!r} ~ {v!r} (same entity)"
                truth[key] = v
            else:
                condition = "clean"  # nothing to vary; count honestly as clean
        elif condition == "true_mismatch":
            key = rng.choice(COMPARED)
            if key == "beneficiary_name":
                other = name
                while normalize(other.split(" ")[0]) == normalize(name.split(" ")[0]):
                    other = person(rng)
                truth[key] = other
            elif key == "village":
                others = [v for v in TALUKS[taluk] if v != village]
                truth[key] = rng.choice(others)
            else:
                truth[key] = rng.choice([t for t in TALUKS if t != taluk])
            planted = f"{key}: case {case[key]!r} vs document {truth[key]!r}"
            should_flag = True
        docs.append(Doc(f"mdb-{seed}-{i:05d}", kind, condition, render(kind, truth), truth, case, should_flag, planted))
    return docs


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------
def to_pdf(text: str, path: Path) -> None:
    """A minimal text PDF, so --via-pdf exercises the same pypdf path as uploads."""
    esc = lambda s: s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")  # noqa: E731
    stream = "BT /F1 12 Tf 50 780 Td 16 TL " + " ".join(f"({esc(line)}) Tj T*" for line in text.splitlines()) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offs = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode("latin-1")
    x = len(out)
    out += (
        f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
        + "".join(f"{o:010d} 00000 n \n" for o in offs).encode()
    )
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    path.write_bytes(out)


def run(docs: list[Doc], via_pdf: bool = False) -> dict:
    if via_pdf:
        from app.document_ai import extract_document

        tmp = Path(tempfile.mkdtemp(prefix="mdb-"))
    field_tally: dict[str, Tally] = defaultdict(Tally)
    by_cond: dict[str, dict] = defaultdict(
        lambda: {"docs": 0, "fields": Tally(), "flagged": 0, "should_flag": 0, "caught": 0}
    )
    flag = Tally()
    variant_docs = variant_flagged = 0
    type_correct = 0
    failures: list[dict] = []

    for d in docs:
        text = d.text
        if via_pdf:
            p = tmp / f"{d.doc_id}.pdf"
            to_pdf(d.text, p)
            text, _, _ = extract_document(p, "application/pdf")
        doc_type, got = extract_fields(text)
        type_correct += doc_type == d.kind

        # field extraction: exact match after the pipeline's own normalisation
        t = Tally()
        for k in FIELDS:
            want, have = d.truth.get(k), got.get(k)
            if want is not None and have is not None:
                if normalize(have) == normalize(want):
                    t.tp += 1
                else:
                    t.fp += 1
                t.fn += 1
            elif want is not None:
                t.fn += 1
            elif have is not None:
                t.fp += 1
            ft = field_tally[k]
            if want is not None and have is not None and normalize(have) == normalize(want):
                ft.tp += 1
            else:
                if have is not None:
                    ft.fp += 1
                if want is not None:
                    ft.fn += 1

        checks = compare_case(got, d.case)
        flagged = any(c.get("status") == "mismatch" for c in checks)
        if flagged and d.should_flag:
            flag.tp += 1
        elif flagged:
            flag.fp += 1
        elif d.should_flag:
            flag.fn += 1
        if d.condition == "variant":
            variant_docs += 1
            variant_flagged += flagged

        c = by_cond[d.condition]
        c["docs"] += 1
        c["fields"].add(t)
        c["flagged"] += flagged
        c["should_flag"] += d.should_flag
        c["caught"] += flagged and d.should_flag
        if (flagged != d.should_flag or t.fn or t.fp) and len(failures) < 12:
            failures.append(
                {
                    "doc_id": d.doc_id,
                    "condition": d.condition,
                    "planted": d.planted,
                    "flagged": flagged,
                    "should_flag": d.should_flag,
                    "extracted": got,
                    "truth": {k: v for k, v in d.truth.items()},
                }
            )

    micro = Tally()
    for v in field_tally.values():
        micro.add(v)
    return {
        "benchmark": "MaargaDocBench",
        "version": VERSION,
        "documents": len(docs),
        "via_pdf": via_pdf,
        "field_f1": round(micro.f1, 4),
        "field_precision": round(micro.precision, 4),
        "field_recall": round(micro.recall, 4),
        "per_field": {
            k: {"precision": round(v.precision, 4), "recall": round(v.recall, 4), "f1": round(v.f1, 4)}
            for k, v in field_tally.items()
        },
        "mismatch_recall": round(flag.recall, 4),
        "mismatch_precision": round(flag.precision, 4),
        "variant_false_alarm_rate": round(variant_flagged / variant_docs, 4) if variant_docs else None,
        "doc_type_accuracy": round(type_correct / len(docs), 4),
        "by_condition": {
            k: {
                "docs": v["docs"],
                "field_f1": round(v["fields"].f1, 4),
                "flag_rate": round(v["flagged"] / v["docs"], 4),
                "mismatch_recall": round(v["caught"] / v["should_flag"], 4) if v["should_flag"] else None,
            }
            for k, v in sorted(by_cond.items(), key=lambda kv: CONDITIONS.index(kv[0]))
        },
        "targets": {"field_f1": 0.90, "mismatch_recall": 0.90},
        "sample_failures": failures,
    }


def report(r: dict) -> str:
    ok = lambda v, t: "meets" if v >= t else "below"  # noqa: E731
    rows = [
        f"MaargaDocBench v{r['version']} — {r['documents']} synthetic documents{' via PDF' if r['via_pdf'] else ''}",
        "",
        f"  Field F1                  {r['field_f1']:.3f}  (P {r['field_precision']:.3f}, R {r['field_recall']:.3f})  target 0.90: {ok(r['field_f1'], 0.9)}",
        f"  Mismatch recall           {r['mismatch_recall']:.3f}  target 0.90: {ok(r['mismatch_recall'], 0.9)}",
        f"  Mismatch precision        {r['mismatch_precision']:.3f}",
        f"  Variant false-alarm rate  {r['variant_false_alarm_rate']:.3f}  (lower is better)",
        f"  Document type accuracy    {r['doc_type_accuracy']:.3f}",
        "",
        "  Condition        docs  field F1  flagged  mismatch recall",
    ]
    for k, v in r["by_condition"].items():
        mr = "—" if v["mismatch_recall"] is None else f"{v['mismatch_recall']:.3f}"
        rows.append(f"  {k:<15} {v['docs']:>5}  {v['field_f1']:>8.3f}  {v['flag_rate']:>7.3f}  {mr:>15}")
    rows += ["", "  Per field:"] + [
        f"    {k:<17} P {v['precision']:.3f}  R {v['recall']:.3f}  F1 {v['f1']:.3f}" for k, v in r["per_field"].items()
    ]
    return "\n".join(rows)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="MaargaDocBench v0: synthetic document benchmark for Mane Maarga.")
    ap.add_argument("--n", type=int, default=500, help="number of documents (default 500)")
    ap.add_argument("--seed", type=int, default=7, help="random seed; same seed, same documents (default 7)")
    ap.add_argument(
        "--via-pdf", action="store_true", help="render each document to PDF and read it back with pypdf first"
    )
    ap.add_argument("--json", type=Path, help="write full results as JSON to this path")
    ap.add_argument("--dump-docs", type=Path, help="write the generated documents (JSONL) to this directory")
    a = ap.parse_args(argv)
    docs = generate(a.n, a.seed)
    if a.dump_docs:
        a.dump_docs.mkdir(parents=True, exist_ok=True)
        with (a.dump_docs / f"maargadocbench_v0_seed{a.seed}.jsonl").open("w", encoding="utf-8") as fh:
            for d in docs:
                fh.write(json.dumps(d.__dict__, ensure_ascii=False) + "\n")
    r = run(docs, via_pdf=a.via_pdf)
    r["seed"] = a.seed
    print(report(r))
    if a.json:
        a.json.write_text(json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nFull results: {a.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
