"""One-time codes for family approvals: 6 digits, stored only as an HMAC, 5-minute expiry, 3 attempts."""

from __future__ import annotations

import hmac
import secrets
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from sqlalchemy.orm import Session

from ..core import config
from ..models import ApprovalOtp, ApprovalRequest, Case
from . import outbox

TTL = timedelta(minutes=5)
MAX_ATTEMPTS = 3
MAX_CODES_PER_APPROVAL = 5


def now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def naive(dt: datetime | None) -> datetime | None:
    """Databases differ on time zones; compare everything as naive UTC."""
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(UTC).replace(tzinfo=None)


def _hmac(approval_id: int, code: str) -> str:
    return hmac.new(config.JWT_SECRET, f"otp:{approval_id}:{code}".encode(), sha256).hexdigest()


class OtpError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def masked_phone(case: Case) -> str:
    return f"******{case.phone_last4}" if case.phone_last4 else "the phone on file"


def issue(db: Session, approval: ApprovalRequest) -> dict:
    sent = db.query(ApprovalOtp).filter(ApprovalOtp.approval_id == approval.id).count()
    if sent >= MAX_CODES_PER_APPROVAL:
        raise OtpError("too_many_codes", "Too many codes for this approval. Ask the case worker for a new link.")
    db.query(ApprovalOtp).filter(ApprovalOtp.approval_id == approval.id, ApprovalOtp.used.is_(False)).update(
        {"used": True}
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(ApprovalOtp(approval_id=approval.id, code_hmac=_hmac(approval.id, code), expires_at=now() + TTL))
    case = db.get(Case, approval.case_id)
    to = masked_phone(case)
    outbox.send(
        db,
        "sms",
        to,
        f"ಮನೆ ಮಾರ್ಗ: ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಸಂಕೇತ {code}. ಇದು 5 ನಿಮಿಷ ಮಾತ್ರ. ಯಾರಿಗೂ ಹೇಳಬೇಡಿ. "
        f"Mane Maarga approval code {code}. Valid 5 minutes. Do not share it.",
        subject="Approval code",
        case_id=approval.case_id,
        approval_id=approval.id,
    )
    db.flush()
    return {"sent_to": to, "expires_in_seconds": int(TTL.total_seconds()), "channel": "sms", "simulated": True}


def verify(db: Session, approval: ApprovalRequest, code: str) -> None:
    otp = (
        db.query(ApprovalOtp)
        .filter(ApprovalOtp.approval_id == approval.id, ApprovalOtp.used.is_(False))
        .order_by(ApprovalOtp.id.desc())
        .first()
    )
    if otp is None:
        raise OtpError("no_code", "Ask for a code first.")
    if naive(otp.expires_at) < now():
        otp.used = True
        raise OtpError("code_expired", "The code has expired. Ask for a new one.")
    otp.attempts += 1
    if not hmac.compare_digest(otp.code_hmac, _hmac(approval.id, code.strip())):
        if otp.attempts >= MAX_ATTEMPTS:
            otp.used = True
            raise OtpError("too_many_attempts", "Three wrong codes. Ask for a new one.")
        raise OtpError("wrong_code", f"Wrong code. {MAX_ATTEMPTS - otp.attempts} tries left.")
    otp.used = True
