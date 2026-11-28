"""Family progress links: consent first, one live link, verified progress only, nothing private on the page."""

import hashlib
import io
import json
from datetime import UTC, datetime, timedelta

from PIL import Image

from app.api import progress
from app.core import config
from app.database import SessionLocal
from app.models import ProgressLink
from tests.test_photo_checks import BIDADI, jpeg, upload

STAGES = [("plinth", "Plinth", 85000), ("lintel", "Walls to lintel", 102000), ("roof", "Roof", 102000)]


def make_case(client, consent=True, plot=BIDADI):
    body = {
        "beneficiary_name": "Saroja B",
        "village": "Bidadi",
        "taluk": "Ramanagara",
        "phone_last4": "4417",
        "estimated_cost": 340000,
        "sanctioned_amount": 120000,
        "notes": "Private note for staff",
    }
    if plot:
        body |= {"plot_lat": plot[0], "plot_lon": plot[1]}
    cid = client.post("/api/cases", json=body).json()["id"]
    if consent:
        client.post(f"/api/cases/{cid}/consent", json={"consent_given": True})
    sids = [
        client.post(f"/api/cases/{cid}/stages", json={"stage_code": c, "stage_name": n, "planned_cost": p}).json()["id"]
        for c, n, p in STAGES
    ]
    return cid, sids


def fresh_photo(seed: int) -> bytes:
    return jpeg(seed, BIDADI[0] + 0.0002, BIDADI[1] + 0.0002, datetime.now(UTC) - timedelta(hours=2))


def public(client, token, path=""):
    """The family has no session: drop the staff token for this call."""
    auth = client.headers.pop("Authorization")
    try:
        return client.get(f"/api/public/progress/{token}{path}")
    finally:
        client.headers["Authorization"] = auth


def test_a_link_needs_the_familys_consent(client):
    cid, _ = make_case(client, consent=False)
    r = client.post(f"/api/cases/{cid}/progress-link", json={})
    assert r.status_code == 409 and "consent" in r.json()["detail"]
    client.post(f"/api/cases/{cid}/consent", json={"consent_given": True})
    r = client.post(f"/api/cases/{cid}/progress-link", json={})
    assert r.status_code == 201
    link = r.json()
    assert link["path"] == f"/#/progress/{link['token']}" and len(link["token"]) == 32
    assert client.get(f"/api/cases/{cid}/progress-link").json()["token"] == link["token"]


def test_the_token_is_never_stored(client):
    cid, _ = make_case(client)
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    with SessionLocal() as db:
        row = db.query(ProgressLink).one()
        stored = json.dumps({c.name: str(getattr(row, c.name)) for c in ProgressLink.__table__.columns})
    assert token not in stored
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()


def test_the_page_shows_verified_progress_and_nothing_private(client):
    cid, (plinth, lintel, _roof) = make_case(client)
    ok = upload(client, cid, plinth, fresh_photo(11))
    client.patch(f"/api/construction-evidence/{ok['id']}/review", json={"status": "accepted"})
    assert client.patch(f"/api/stages/{plinth}/status", json={"status": "verified"}).status_code == 200
    waiting = upload(client, cid, lintel, fresh_photo(12))
    client.patch(f"/api/stages/{lintel}/status", json={"status": "in_progress"})
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]

    r = public(client, token)
    assert r.status_code == 200
    page = r.json()
    assert page["first_name"] == "Saroja" and page["village"] == "Bidadi" and page["plot"] == list(BIDADI)
    steps = [(s["code"], s["status"], s["step"]) for s in page["stages"]]
    assert steps == [
        ("plinth", "verified", "done"),
        ("lintel", "in_progress", "photo_in_review"),
        ("roof", "planned", "not_started"),
    ]
    assert page["stages"][0]["done_at"] and page["updated_at"]
    assert [p["id"] for p in page["stages"][0]["photos"]] == [ok["id"]]
    assert page["stages"][1]["photos"] == []  # waiting for review: not shown to the family
    text = json.dumps(page)
    for private in ("Saroja B", "4417", "340000", "120000", "Private note", "testadmin", "site.jpg", "gps"):
        assert private not in text, private
    assert public(client, token, f"/photos/{waiting['id']}").status_code == 404


def test_accepted_photos_lose_their_gps_on_the_way_out(client):
    cid, (plinth, *_) = make_case(client)
    ev = upload(client, cid, plinth, fresh_photo(13))
    client.patch(f"/api/construction-evidence/{ev['id']}/review", json={"status": "accepted"})
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    r = public(client, token, f"/photos/{ev['id']}")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    exif = Image.open(io.BytesIO(r.content)).getexif()
    assert 0x8825 not in exif and 0x0132 not in exif and len(exif) == 0


def test_a_photo_from_another_family_is_not_served(client):
    cid, (plinth, *_) = make_case(client)
    other_cid, (other_plinth, *_) = make_case(client)
    theirs = upload(client, other_cid, other_plinth, fresh_photo(14))
    client.patch(f"/api/construction-evidence/{theirs['id']}/review", json={"status": "accepted"})
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    assert public(client, token, f"/photos/{theirs['id']}").status_code == 404


def test_the_map_can_be_left_out(client):
    cid, _ = make_case(client)
    token = client.post(f"/api/cases/{cid}/progress-link", json={"show_map": False}).json()["token"]
    assert public(client, token).json()["plot"] is None


def test_views_count_visits_not_refreshes(client):
    cid, _ = make_case(client)
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    for _ in range(3):  # the page refreshing itself
        assert public(client, token).status_code == 200
    link = client.get(f"/api/cases/{cid}/progress-link").json()
    assert link["views"] == 1 and link["last_viewed_at"]
    with SessionLocal() as db:  # come back the next day
        row = db.query(ProgressLink).one()
        row.last_viewed_at = datetime.now(UTC) - progress.VISIT_GAP - timedelta(minutes=1)
        db.commit()
    public(client, token)
    assert client.get(f"/api/cases/{cid}/progress-link").json()["views"] == 2


def test_a_new_link_switches_the_old_one_off(client):
    cid, _ = make_case(client)
    old = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    new = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    assert old != new
    assert public(client, old).status_code == 410
    assert public(client, new).status_code == 200


def test_switching_off_is_permanent_and_audited(client):
    cid, _ = make_case(client)
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    assert client.delete(f"/api/cases/{cid}/progress-link").status_code == 204
    assert public(client, token).status_code == 410
    assert client.get(f"/api/cases/{cid}/progress-link").json() is None
    assert client.delete(f"/api/cases/{cid}/progress-link").status_code == 404
    actions = [a["action"] for a in client.get(f"/api/audit?case_id={cid}").json()]
    assert "progress_link_created" in actions and "progress_link_revoked" in actions


def test_withdrawing_consent_pauses_the_page(client):
    cid, _ = make_case(client)
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    client.post(f"/api/cases/{cid}/consent", json={"consent_given": False})
    assert public(client, token).status_code == 403
    assert public(client, "not-a-real-token").status_code == 404


def test_the_link_goes_out_as_a_simulated_sms(client, monkeypatch):
    monkeypatch.setattr(config, "PUBLIC_APP_URL", "https://mane-maarga.example.in")
    cid, _ = make_case(client)
    assert client.post(f"/api/cases/{cid}/progress-link/sms").status_code == 404
    token = client.post(f"/api/cases/{cid}/progress-link", json={}).json()["token"]
    r = client.post(f"/api/cases/{cid}/progress-link/sms")
    assert r.status_code == 200 and r.json()["sent_to"] == "******4417" and r.json()["simulated"] is True
    sms = client.get(f"/api/outbox?case_id={cid}").json()[0]
    assert sms["channel"] == "sms" and f"https://mane-maarga.example.in/#/progress/{token}" in sms["body"]
    assert "ಮನೆ ಮಾರ್ಗ" in sms["body"]
