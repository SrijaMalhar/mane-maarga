"""The outbox: one table for everything that would leave the system (SMS, WhatsApp, portal, payment, sharing).

Nothing here talks to a real provider yet, so every row is marked simulated and the UI labels it "Simulated".
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import OutboxMessage


def send(
    db: Session,
    channel: str,
    to_ref: str,
    body: str,
    *,
    subject: str = "",
    case_id: int | None = None,
    approval_id: int | None = None,
) -> OutboxMessage:
    msg = OutboxMessage(
        channel=channel,
        to_ref=to_ref,
        subject=subject,
        body=body,
        case_id=case_id,
        approval_id=approval_id,
        simulated=True,
    )
    db.add(msg)
    db.flush()
    return msg
