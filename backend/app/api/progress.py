"""Family progress links: a read-only page where a family follows their house being built.

What the page shows: the family's first name, village, each construction stage and where it stands, the site photos
a reviewer accepted (re-encoded, so no GPS or camera details travel with them) and, if staff allow it, the plot on a
map. It never shows money, documents, phone numbers, staff names or photos that were not accepted.

Rules:
- A link needs the family's consent on record. If consent is withdrawn later, the page pauses at once.
- One live link per case. Making a new one switches the old one off; switching off is permanent.
- The token is an HMAC of a stored nonce, so staff can show the same link again but the database alone cannot.
"""

import hashlib
import hmac
import io
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from PIL import Image, ImageOps
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..channels import outbox
from ..channels.otp import masked_phone
from ..core import config
from ..core.audit import write_audit
from ..core.config import JWT_SECRET
from ..core.security import Authenticated, Operator, _b64
from ..database import get_db
from ..models import AuditLog, Case, ConstructionEvidence, ConstructionStage, ProgressLink

router = APIRouter(tags=["progress"])

# Opening the page again within this window (or the page refreshing itself) is the same visit.
VISIT_GAP = timedelta(minutes=30)


def _token(nonce: str) -> str:
    return _b64(hmac.new(JWT_SECRET, f"progress-link:{nonce}".encode(), hashlib.sha256).digest())[:32]


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _utc(value: datetime | None) -> datetime | None:
    """SQLite gives back naive timestamps; they are UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _active(db: Session, case_id: int) -> ProgressLink | None:
    return (
        db.query(ProgressLink)
        .filter(ProgressLink.case_id == case_id, ProgressLink.revoked_at.is_(None))
        .order_by(ProgressLink.id.desc())
        .first()
    )


def _case_or_404(db: Session, case_id: int) -> Case:
    case = db.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


def _out(link: ProgressLink) -> dict:
    token = _token(link.nonce)
    return {
        "id": link.id,
        "case_id": link.case_id,
        "token": token,
        "path": f"/#/progress/{token}",
        "show_map": link.show_map,
        "created_by": link.created_by,
        "created_at": link.created_at,
        "views": link.views,
        "last_viewed_at": link.last_viewed_at,
    }


# --- staff -------------------------------------------------------------------------------------


@router.get("/api/cases/{case_id}/progress-link")
def get_progress_link(case_id: int, user: Authenticated, db: Session = Depends(get_db)):
    """The live link for this case, or null if there is none."""
    _case_or_404(db, case_id)
    link = _active(db, case_id)
    return _out(link) if link else None


class LinkIn(BaseModel):
    show_map: bool = True


@router.post("/api/cases/{case_id}/progress-link", status_code=201)
def create_progress_link(case_id: int, body: LinkIn, user: Operator, db: Session = Depends(get_db)):
    case = _case_or_404(db, case_id)
    if case.consent_status != "given":
        raise HTTPException(
            status_code=409, detail="The family's consent is not on record, so their progress cannot be shared."
        )
    old = _active(db, case_id)
    if old:
        old.revoked_at, old.revoked_by = datetime.now(UTC), user.username
    nonce = secrets.token_hex(16)
    link = ProgressLink(
        case_id=case_id, nonce=nonce, token_hash=_hash(_token(nonce)), show_map=body.show_map, created_by=user.username
    )
    db.add(link)
    db.flush()
    write_audit(
        db,
        "progress_link_created",
        case_id,
        f"link_id={link.id}; show_map={body.show_map}" + (f"; replaced={old.id}" if old else ""),
        user.username,
    )
    db.commit()
    db.refresh(link)
    return _out(link)


@router.delete("/api/cases/{case_id}/progress-link", status_code=204)
def revoke_progress_link(case_id: int, user: Operator, db: Session = Depends(get_db)):
    _case_or_404(db, case_id)
    link = _active(db, case_id)
    if not link:
        raise HTTPException(status_code=404, detail="This case has no live progress link")
    link.revoked_at, link.revoked_by = datetime.now(UTC), user.username
    write_audit(db, "progress_link_revoked", case_id, f"link_id={link.id}; views={link.views}", user.username)
    db.commit()
    return Response(status_code=204)


@router.post("/api/cases/{case_id}/progress-link/sms")
def send_progress_link(case_id: int, user: Operator, db: Session = Depends(get_db)):
    """Puts the link in the outbox as an SMS to the family. Simulated until a real SMS provider is connected."""
    case = _case_or_404(db, case_id)
    link = _active(db, case_id)
    if not link:
        raise HTTPException(status_code=404, detail="Make a progress link first")
    if case.consent_status != "given":
        raise HTTPException(status_code=409, detail="The family's consent is not on record")
    if not config.PUBLIC_APP_URL:
        raise HTTPException(status_code=409, detail="Set MANE_MAARGA_PUBLIC_APP_URL so the SMS can carry a full link")
    url = f"{config.PUBLIC_APP_URL}/#/progress/{_token(link.nonce)}"
    name = case.beneficiary_name.split()[0]
    to = masked_phone(case)
    msg = outbox.send(
        db,
        "sms",
        to,
        f"ಮನೆ ಮಾರ್ಗ: {name} ಅವರೇ, ನಿಮ್ಮ ಮನೆ ಕೆಲಸ ಎಷ್ಟು ಆಗಿದೆ ಎಂದು ಇಲ್ಲಿ ನೋಡಿ: {url} "
        f"Mane Maarga: see how your house is coming along: {url}",
        subject="Your house, stage by stage",
        case_id=case_id,
    )
    write_audit(db, "progress_link_sent", case_id, f"link_id={link.id}; channel=sms; to={to}", user.username)
    db.commit()
    return {"sent_to": to, "channel": "sms", "simulated": True, "outbox_id": msg.id}


# --- the family's page (no login: the link is the key) ----------------------------------------------------


def _link_by_token(db: Session, token: str) -> tuple[ProgressLink, Case]:
    link = db.query(ProgressLink).filter(ProgressLink.token_hash == _hash(token)).first() if token else None
    if link is None:
        raise HTTPException(status_code=404, detail="This link is not valid.")
    if link.revoked_at is not None:
        raise HTTPException(status_code=410, detail="This link was switched off. Ask the case worker for a new one.")
    case = db.get(Case, link.case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="This link is not valid.")
    if case.consent_status != "given":
        raise HTTPException(status_code=403, detail="This page is paused. Ask the case worker.")
    return link, case


def _step(stage: ConstructionStage, photos: list[ConstructionEvidence]) -> str:
    """Where one stage stands, in the words the family page uses."""
    if stage.status in ("verified", "completed"):
        return "done"
    if stage.status == "blocked":
        return "paused"
    states = {p.verification_status for p in photos}
    if "accepted" in states:
        return "ready_to_verify"
    if states & {"pending_review", "pending"}:
        return "photo_in_review"
    if "retake" in states:
        return "retake"
    return "photo_needed" if stage.status == "in_progress" else "not_started"


@router.get("/api/public/progress/{token}")
def family_progress(token: str, db: Session = Depends(get_db)):
    link, case = _link_by_token(db, token)
    now = datetime.now(UTC)
    last = _utc(link.last_viewed_at)
    if last is None or now - last > VISIT_GAP:
        link.views += 1
    link.last_viewed_at = now

    stages = (
        db.query(ConstructionStage)
        .filter(ConstructionStage.case_id == case.id)
        .order_by(ConstructionStage.id.asc())
        .all()
    )
    photos = (
        db.query(ConstructionEvidence)
        .filter(ConstructionEvidence.case_id == case.id)
        .order_by(ConstructionEvidence.uploaded_at.asc())
        .all()
    )
    verified_log = (
        db.query(AuditLog)
        .filter(AuditLog.case_id == case.id, AuditLog.action == "construction_stage_status_updated")
        .all()
    )
    changes: list[datetime] = []
    out_stages = []
    for s in stages:
        own = [p for p in photos if p.stage_id == s.id]
        accepted = [p for p in own if p.verification_status == "accepted"]
        marks = [
            _utc(a.created_at)
            for a in verified_log
            if a.detail in (f"stage_id={s.id}; status=verified", f"stage_id={s.id}; status=completed")
        ]
        done_at = None
        if s.status in ("verified", "completed"):
            done_at = max([m for m in marks if m], default=None) or max(
                [_utc(p.reviewed_at) for p in accepted if p.reviewed_at], default=None
            )
        changes += [d for d in [done_at, _utc(s.created_at)] if d]
        changes += [d for p in own for d in (_utc(p.uploaded_at), _utc(p.reviewed_at)) if d]
        out_stages.append(
            {
                "code": s.stage_code,
                "name": s.stage_name,
                "status": s.status,
                "step": _step(s, own),
                "done_at": done_at,
                "photos": [
                    {"id": p.id, "taken_at": p.taken_at, "accepted_at": p.reviewed_at}
                    for p in sorted(accepted, key=lambda p: _utc(p.reviewed_at) or now)
                ],
            }
        )
    plot = None
    if link.show_map and case.plot_lat is not None and case.plot_lon is not None:
        plot = [float(case.plot_lat), float(case.plot_lon)]
    db.commit()
    return {
        "first_name": case.beneficiary_name.split()[0],
        "village": case.village,
        "taluk": case.taluk,
        "status": case.status,
        "stages": out_stages,
        "plot": plot,
        "updated_at": max(changes, default=None),
        "checked_at": now,
    }


@router.get("/api/public/progress/{token}/photos/{evidence_id}")
def family_progress_photo(token: str, evidence_id: int, db: Session = Depends(get_db)):
    """An accepted site photo, re-encoded so its GPS, time and camera details stay on the server."""
    _link, case = _link_by_token(db, token)
    ev = db.get(ConstructionEvidence, evidence_id)
    if ev is None or ev.case_id != case.id or ev.verification_status != "accepted":
        raise HTTPException(status_code=404, detail="Photo not found")
    path = (config.UPLOAD_DIR / str(ev.case_id) / "evidence" / ev.stored_name).resolve()
    if not path.is_relative_to(config.UPLOAD_DIR.resolve()) or not path.exists():
        raise HTTPException(status_code=404, detail="Photo file is missing")
    try:
        with Image.open(path) as im:
            clean = ImageOps.exif_transpose(im).convert("RGB")
            clean.thumbnail((1600, 1600))
            buf = io.BytesIO()
            clean.save(buf, "JPEG", quality=82, optimize=True)
    except OSError as exc:
        raise HTTPException(status_code=404, detail="Photo file is missing") from exc
    return Response(buf.getvalue(), media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})
