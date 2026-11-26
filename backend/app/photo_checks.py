"""Checks a reviewer sees on a site photo: where and when it was taken, and whether it was used before.

These are flags for a person, never a verdict. Nothing here accepts or rejects a photo.
- Where: the photo's GPS (from EXIF) against the family's plot pin, as a distance in metres.
- When: the photo's capture time (EXIF DateTimeOriginal) against the time it was uploaded.
- Reused: a 16x16 grey thumbnail of the image, compared with every other site photo on file.
  It catches the same photo sent again, resized or recompressed; it does not catch a cropped copy.
"""

from __future__ import annotations

import io
import math
from datetime import UTC, datetime
from typing import Any

from PIL import Image, ImageOps

NEAR_M = 150  # within this, the photo was taken at the plot
FAR_M = 1000  # beyond this, the photo is flagged as far from the plot
STALE_DAYS = 30  # taken this long before upload is flagged
SAME_PICTURE = 0.06  # thumbnails closer than this (RMS of normalised grey levels) are the same picture

GPS_IFD, EXIF_IFD = 0x8825, 0x8769


def _deg(value: Any, ref: str | None) -> float | None:
    try:
        d, m, s = (float(x) for x in value)
    except (TypeError, ValueError):
        return None
    out = d + m / 60 + s / 3600
    return -out if ref in ("S", "W") else out


def read_photo(content: bytes) -> dict:
    """Capture time, GPS and fingerprint from the image bytes. Missing parts come back as None."""
    out: dict[str, Any] = {"taken_at": None, "gps_lat": None, "gps_lon": None, "fingerprint": None}
    try:
        im = Image.open(io.BytesIO(content))
        exif = im.getexif()
    except Exception:  # not an image Pillow can read: no metadata, no fingerprint
        return out
    gps = exif.get_ifd(GPS_IFD)
    if gps:
        lat, lon = _deg(gps.get(2), gps.get(1)), _deg(gps.get(4), gps.get(3))
        if lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180:
            out["gps_lat"], out["gps_lon"] = round(lat, 6), round(lon, 6)
    raw = exif.get_ifd(EXIF_IFD).get(0x9003) or exif.get(0x0132)
    if raw:
        try:
            out["taken_at"] = datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC)
        except ValueError:
            pass
    out["fingerprint"] = fingerprint(im)
    return out


def fingerprint(im: Image.Image) -> str:
    """A 16x16 grey thumbnail as 512 hex characters. Box-averaged, so recompression barely moves it."""
    g = ImageOps.exif_transpose(im).convert("L").resize((16, 16), Image.Resampling.BOX)
    return bytes(int(g.getpixel((x, y)) or 0) for y in range(16) for x in range(16)).hex()  # type: ignore[arg-type]


def _norm(fp: str) -> list[float]:
    px = list(bytes.fromhex(fp))
    m = sum(px) / len(px)
    sd = math.sqrt(sum((p - m) ** 2 for p in px) / len(px)) or 1.0
    return [(p - m) / sd for p in px]


def picture_distance(a: str, b: str) -> float:
    """0 for the same picture; different photos of different places are well above SAME_PICTURE."""
    x, y = _norm(a), _norm(b)
    return math.sqrt(sum((p - q) ** 2 for p, q in zip(x, y, strict=True)) / len(x))


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2, dl = math.radians(lat1), math.radians(lat2), math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def _aware(t: Any) -> datetime | None:
    if t is None:
        return None
    if isinstance(t, str):
        t = datetime.fromisoformat(t)
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def evaluate(photo: dict, plot: tuple[float | None, float | None], others: list[dict]) -> dict:
    """photo: taken_at, gps_lat, gps_lon, fingerprint, uploaded_at. others: other photos with who/where."""
    where: dict[str, Any]
    lat, lon = photo.get("gps_lat"), photo.get("gps_lon")
    if plot[0] is None or plot[1] is None:
        where = {"state": "no_plot", "flag": False}
    elif lat is None or lon is None:
        where = {"state": "no_gps", "flag": True}
    else:
        d = distance_m(plot[0], plot[1], lat, lon)
        state = "at_plot" if d <= NEAR_M else "near" if d <= FAR_M else "far"
        where = {
            "state": state,
            "flag": state == "far",
            "distance_m": round(d),
            "bearing_deg": round(bearing_deg(plot[0], plot[1], lat, lon)),
        }

    taken, uploaded = _aware(photo.get("taken_at")), _aware(photo.get("uploaded_at")) or datetime.now(UTC)
    when: dict[str, Any]
    if taken is None:
        when = {"state": "no_time", "flag": True}
    else:
        days = (uploaded - taken).total_seconds() / 86400
        state = "future" if days < -1 else "stale" if days > STALE_DAYS else "fresh"
        when = {
            "state": state,
            "flag": state != "fresh",
            "taken_at": taken.isoformat(),
            "days_before_upload": round(days, 1),
        }

    fp = photo.get("fingerprint")
    matches = []
    if fp:
        for o in others:
            if o.get("fingerprint") and len(o["fingerprint"]) == len(fp):
                dist = picture_distance(fp, o["fingerprint"])
                if dist < SAME_PICTURE:
                    keys = ("evidence_id", "case_id", "who", "village", "stage_name", "same_case")
                    matches.append({**{k: o[k] for k in keys}, "distance": round(dist, 3)})
    reused = {
        "state": "reused" if matches else "unique" if fp else "unknown",
        "flag": bool(matches),
        "matches": matches[:5],
    }

    flags = [name for name, c in (("where", where), ("when", when), ("reused", reused)) if c["flag"]]
    return {"where": where, "when": when, "reused": reused, "flags": flags}
