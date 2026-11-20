#!/usr/bin/env python3
"""Fill a local Mane Maarga workspace with clearly synthetic demo records.

Every name and number here is invented. Use this for demos and screenshots only,
never alongside real beneficiary data.

    python scripts/seed_demo.py --api http://localhost:8000 \
        --username demo_admin --password 'choose-a-long-password'

If the workspace has no users yet, the first administrator is created with the
given credentials (needs SOORU_BOOTSTRAP_ENABLED, on by default in development).
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid

CASES = [
    # name, village, taluk, status, estimate, sanctioned, existing loan, notes
    ("Lakshmamma (sample)", "Hosahalli", "Magadi", "construction", 320000, 120000, 0, "Widow, two school-going children. Roof stage pending."),
    ("Nagaraju K (sample)", "Kudur", "Magadi", "finance_review", 350000, 120000, 40000, "Daily-wage farm worker; savings of about ₹20,000."),
    ("Shivamma (sample)", "Hosahalli", "Magadi", "verified", 300000, 0, 0, ""),
    ("Manjunath G (sample)", "Bidadi", "Ramanagara", "planning", 280000, 0, 0, "Needs plan approval from the gram panchayat."),
    ("Gowramma (sample)", "Kudur", "Magadi", "completed", 310000, 120000, 0, "Keys handed over."),
    ("Ravi Kumar (sample)", "Harohalli", "Kanakapura", "intake", 0, 0, 0, "First visit done; land record to be collected."),
    ("Saroja B (sample)", "Bidadi", "Ramanagara", "construction", 340000, 120000, 25000, ""),
    ("Thimmaiah (sample)", "Harohalli", "Kanakapura", "intake", 0, 0, 0, ""),
    ("Kamala D (sample)", "Hosahalli", "Magadi", "finance_review", 0, 120000, 0, "Cost estimate not yet prepared."),
]


def minimal_pdf(lines):
    """A tiny valid PDF with real text, so the document reader has something to read."""
    text = "BT /F1 13 Tf 50 760 Td 18 TL " + " ".join(f"({l}) Tj T*" for l in lines) + " ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(text)} >>\nstream\n{text}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


class Api:
    def __init__(self, base):
        self.base, self.token = base.rstrip("/"), ""

    def call(self, method, path, body=None, raw=None, ctype="application/json"):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", ctype)
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req) as r:
                text = r.read()
                return json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            sys.exit(f"{method} {path} failed: {e.code} {e.read().decode()[:300]}")

    def upload(self, path, filename, content, mime):
        boundary = uuid.uuid4().hex
        body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\n"
                f"Content-Type: {mime}\r\n\r\n").encode() + content + f"\r\n--{boundary}--\r\n".encode()
        return self.call("POST", path, raw=body, ctype=f"multipart/form-data; boundary={boundary}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--api", default="http://localhost:8000")
    p.add_argument("--username", required=True)
    p.add_argument("--password", required=True)
    p.add_argument("--email", default="demo-admin@example.test")
    a = p.parse_args()
    api = Api(a.api)

    status = api.call("GET", "/api/auth/status")
    if status["bootstrap_required"]:
        res = api.call("POST", "/api/auth/bootstrap", {"username": a.username, "email": a.email, "password": a.password})
    else:
        res = api.call("POST", "/api/auth/login", {"username": a.username, "password": a.password})
    api.token = res["access_token"]

    if api.call("GET", "/api/cases"):
        sys.exit("This workspace already has cases. Seed an empty workspace so demo and real records never mix.")

    ids = {}
    for name, village, taluk, st, est, sanc, loan, notes in CASES:
        c = api.call("POST", "/api/cases", {"beneficiary_name": name, "village": village, "taluk": taluk, "status": st,
                                            "estimated_cost": est, "sanctioned_amount": sanc, "existing_loan": loan, "notes": notes})
        ids[name] = c["id"]
        if "Thimmaiah" not in name:  # leave one case without consent so the attention list has something real
            api.call("POST", f"/api/cases/{c['id']}/consent", {"consent_given": True, "consent_scope": "case_processing"})

    # Documents: a land record that matches, and one with a village mismatch to show the review flow.
    lak, nag, shi = ids["Lakshmamma (sample)"], ids["Nagaraju K (sample)"], ids["Shivamma (sample)"]
    d1 = api.upload(f"/api/cases/{lak}/documents", "rtc-pahani-hosahalli.pdf",
                    minimal_pdf(["RECORD OF RIGHTS (RTC) - SAMPLE", "Survey No: 45/2", "Village: Hosahalli", "Taluk: Magadi",
                                 "Owner: Lakshmamma (sample)", "Extent: 0.10 acre"]), "application/pdf")
    api.call("POST", f"/api/documents/{d1['id']}/extract", {"force": False})
    api.call("PATCH", f"/api/documents/{d1['id']}/verification?status=verified")
    api.upload(f"/api/cases/{lak}/documents", "pmayg-sanction-order.pdf",
               minimal_pdf(["PMAY-G SANCTION ORDER - SAMPLE", "Beneficiary: Lakshmamma (sample)", "Reference No: KA-MGD-2025-0142",
                            "Unit assistance: Rs 1,20,000"]), "application/pdf")
    d3 = api.upload(f"/api/cases/{nag}/documents", "land-record-kudur.pdf",
                    minimal_pdf(["RECORD OF RIGHTS (RTC) - SAMPLE", "Survey No: 112/1", "Village: Kuduru", "Taluk: Magadi",
                                 "Owner: Nagaraju K (sample)"]), "application/pdf")
    api.call("POST", f"/api/documents/{d3['id']}/extract", {"force": False})
    api.upload(f"/api/cases/{shi}/documents", "aadhaar-masked.pdf",
               minimal_pdf(["IDENTITY PROOF - SAMPLE (masked)", "Name: Shivamma (sample)", "XXXX XXXX 4417"]), "application/pdf")

    # Funding: confirmed subsidy with a reference, received first instalment, proposed savings.
    api.call("POST", f"/api/cases/{lak}/funding", {"source_type": "subsidy", "source_name": "PMAY-G unit assistance", "amount": 120000,
                                                   "status": "confirmed", "scheme_code": "PMAY-G", "reference_number": "KA-MGD-2025-0142"})
    api.call("POST", f"/api/cases/{lak}/funding", {"source_type": "savings", "source_name": "Self-help group savings", "amount": 25000, "status": "received"})
    api.call("POST", f"/api/cases/{lak}/funding", {"source_type": "loan", "source_name": "PMAY-G scheme loan (applied)", "amount": 70000, "status": "proposed"})
    api.call("POST", f"/api/cases/{nag}/funding", {"source_type": "wages", "source_name": "MGNREGA unskilled labour days", "amount": 27000, "status": "proposed"})

    # Construction stages for the two homes being built.
    for cid, done in ((lak, 2), (ids["Saroja B (sample)"], 1), (ids["Gowramma (sample)"], 4)):
        est = next(c[4] for c in CASES if ids[c[0]] == cid)
        for i, (code, name, share) in enumerate((("plinth", "Plinth", .25), ("lintel", "Walls to lintel", .3), ("roof", "Roof", .3), ("finish", "Finishing and keys", .15))):
            s = api.call("POST", f"/api/cases/{cid}/stages", {"stage_code": code, "stage_name": name, "planned_cost": round(est * share)})
            if i < done:
                api.call("PATCH", f"/api/stages/{s['id']}/status", {"status": "verified"})
            elif i == done and done < 4:
                api.call("PATCH", f"/api/stages/{s['id']}/status", {"status": "in_progress"})

    api.call("POST", f"/api/cases/{lak}/recovery-tasks", {"title": "Confirm roof material quote with mason", "category": "construction"})
    print(f"Seeded {len(CASES)} synthetic cases. Sign in as {a.username}.")


if __name__ == "__main__":
    main()
