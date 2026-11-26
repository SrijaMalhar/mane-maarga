"""Site photo checks: distance from the plot, capture time, and the same picture used twice."""

import io
from datetime import UTC, datetime, timedelta

from PIL import Image, ImageDraw

from app.photo_checks import SAME_PICTURE, distance_m, picture_distance, read_photo

BIDADI = (12.7960, 77.3905)


def jpeg(seed: int, lat: float | None = None, lon: float | None = None, taken: datetime | None = None) -> bytes:
    im = Image.new("RGB", (320, 240), (140, 180, 220))
    d = ImageDraw.Draw(im)
    for i in range(6):  # a different picture per seed
        x = (seed * 53 + i * 47) % 280
        d.rectangle([x, 120 + i * 15, x + 40, 240], fill=((seed * 40 + i * 30) % 255, 90, 60))
    exif = Image.Exif()
    if lat is not None and lon is not None:

        def dms(v: float):
            v = abs(v)
            d_, m = int(v), int((v % 1) * 60)
            return (float(d_), float(m), round(((v % 1) * 60 - m) * 60, 2))

        exif[0x8825] = {1: "N" if lat >= 0 else "S", 2: dms(lat), 3: "E" if lon >= 0 else "W", 4: dms(lon)}
    if taken:
        exif[0x0132] = taken.strftime("%Y:%m:%d %H:%M:%S")
    buf = io.BytesIO()
    im.save(buf, "JPEG", exif=exif, quality=90)
    return buf.getvalue()


def setup_stage(client, plot=BIDADI, name="Saroja B"):
    body = {"beneficiary_name": name, "village": "Bidadi", "taluk": "Ramanagara", "estimated_cost": 340000}
    if plot:
        body |= {"plot_lat": plot[0], "plot_lon": plot[1]}
    cid = client.post("/api/cases", json=body).json()["id"]
    sid = client.post(
        f"/api/cases/{cid}/stages", json={"stage_code": "plinth", "stage_name": "Plinth", "planned_cost": 85000}
    ).json()["id"]
    return cid, sid


def upload(client, cid, sid, content, name="site.jpg"):
    r = client.post(f"/api/cases/{cid}/stages/{sid}/evidence", files={"file": (name, content, "image/jpeg")})
    assert r.status_code == 201, r.text
    return r.json()


def test_read_photo_gets_gps_time_and_fingerprint():
    t = datetime(2026, 11, 25, 10, 42, tzinfo=UTC)
    meta = read_photo(jpeg(1, 12.7962, 77.3907, t))
    assert meta["taken_at"] == t and len(meta["fingerprint"]) == 512
    assert distance_m(*BIDADI, meta["gps_lat"], meta["gps_lon"]) < 40


def test_a_fresh_photo_at_the_plot_has_no_warnings(client):
    cid, sid = setup_stage(client)
    ev = upload(client, cid, sid, jpeg(2, 12.7962, 77.3907, datetime.now(UTC) - timedelta(hours=3)))
    c = ev["checks"]
    assert c["flags"] == [] and c["where"]["state"] == "at_plot" and c["where"]["distance_m"] < 150
    assert c["when"]["state"] == "fresh" and c["reused"]["state"] == "unique"
    ok = client.patch(f"/api/construction-evidence/{ev['id']}/review", json={"status": "accepted"})
    assert ok.status_code == 200


def test_far_and_old_photos_are_flagged(client):
    cid, sid = setup_stage(client)
    kudur = (13.0490, 77.1470)  # about 38 km from the plot
    ev = upload(client, cid, sid, jpeg(3, *kudur, datetime.now(UTC) - timedelta(days=90)))
    c = ev["checks"]
    assert set(c["flags"]) == {"where", "when"}
    assert c["where"]["state"] == "far" and c["where"]["distance_m"] > 30000
    assert c["when"]["state"] == "stale" and c["when"]["days_before_upload"] > 80


def test_the_same_picture_for_two_families_is_caught_on_both(client):
    cid1, sid1 = setup_stage(client, name="Gowramma")
    cid2, sid2 = setup_stage(client, name="Saroja B")
    now = datetime.now(UTC)
    first = upload(client, cid1, sid1, jpeg(4, 12.7962, 77.3907, now))
    again = upload(client, cid2, sid2, jpeg(4, 12.7962, 77.3907, now), name="walls-new.jpg")
    assert again["checks"]["reused"]["state"] == "reused"
    m = again["checks"]["reused"]["matches"][0]
    assert m["evidence_id"] == first["id"] and m["who"] == "Gowramma" and m["same_case"] is False
    listed = client.get(f"/api/cases/{cid1}/construction-evidence").json()
    assert "reused" in listed[0]["checks"]["flags"]  # the earlier photo now shows the warning too
    blocked = client.patch(f"/api/construction-evidence/{again['id']}/review", json={"status": "accepted"})
    assert blocked.status_code == 422 and "reused" in blocked.json()["detail"]


def test_without_a_plot_pin_location_is_not_flagged(client):
    cid, sid = setup_stage(client, plot=None)
    ev = upload(client, cid, sid, jpeg(5, 12.7962, 77.3907, datetime.now(UTC)))
    assert ev["checks"]["where"]["state"] == "no_plot" and "where" not in ev["checks"]["flags"]


def test_a_resized_recompressed_copy_is_the_same_picture_but_another_photo_is_not():
    original = jpeg(6)
    im = Image.open(io.BytesIO(original)).resize((200, 150))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=40)
    fp = read_photo(original)["fingerprint"]
    assert picture_distance(fp, read_photo(buf.getvalue())["fingerprint"]) < SAME_PICTURE
    assert picture_distance(fp, read_photo(jpeg(7))["fingerprint"]) > SAME_PICTURE * 2
