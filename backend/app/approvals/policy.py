"""Which actions are gated, who approves them, what their payload must contain, and how to say them plainly."""

from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

from ..lib_money import format_inr
from ..schemas import Status

POLICY_FILE = Path(__file__).resolve().parents[1] / "policies" / "gated_actions.yaml"


@lru_cache(maxsize=1)
def policy() -> dict[str, dict]:
    return yaml.safe_load(POLICY_FILE.read_text(encoding="utf-8"))["gated_actions"]


def is_gated(action: str) -> bool:
    return action in policy()


class StatusPayload(BaseModel):
    new_status: Status


class PortalPayload(BaseModel):
    portal: str = Field("AwaasSoft (PMAY-G)", min_length=2, max_length=120)
    document_ids: list[int] = Field(default_factory=list, max_length=30)


class TranchePayload(BaseModel):
    stage: str = Field(min_length=2, max_length=60)
    amount_inr: float = Field(gt=0, le=10_000_000)
    payee: str = Field("the beneficiary's bank account", max_length=120)


class LoanPayload(BaseModel):
    lender: str = Field(min_length=2, max_length=120)
    amount_inr: float = Field(gt=0, le=10_000_000)
    rate_pa: float | None = Field(default=None, ge=0, le=1)
    months: int | None = Field(default=None, gt=0, le=360)
    funding_source_id: int | None = None


class PaymentPayload(BaseModel):
    amount_inr: float = Field(gt=0, le=10_000_000)
    payee: str = Field(min_length=2, max_length=120)
    purpose: str = Field(min_length=2, max_length=200)


class SharePayload(BaseModel):
    recipient: str = Field(min_length=2, max_length=120)
    document_ids: list[int] = Field(min_length=1, max_length=30)
    purpose: str = Field(min_length=2, max_length=200)


PAYLOADS: dict[str, type[BaseModel]] = {
    "change_case_status": StatusPayload,
    "submit_to_portal": PortalPayload,
    "request_tranche": TranchePayload,
    "accept_loan": LoanPayload,
    "pay_any_amount": PaymentPayload,
    "share_documents_with_third_party": SharePayload,
}
GatedAction = Literal[
    "submit_to_portal",
    "request_tranche",
    "accept_loan",
    "pay_any_amount",
    "share_documents_with_third_party",
    "change_case_status",
]


def canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def payload_hash(case_id: int, action: str, payload: dict) -> str:
    return hashlib.sha256(f"{case_id}|{action}|{canonical(payload)}".encode()).hexdigest()


STATUS_KN = {
    "intake": "ಹೊಸ ಅರ್ಜಿ",
    "verified": "ಪರಿಶೀಲಿಸಲಾಗಿದೆ",
    "planning": "ಯೋಜನೆ",
    "finance_review": "ಹಣಕಾಸು ಪರಿಶೀಲನೆ",
    "construction": "ನಿರ್ಮಾಣ",
    "completed": "ಪೂರ್ಣಗೊಂಡಿದೆ",
}


def summarise(action: str, p: dict, name: str) -> tuple[str, str, float | None, str]:
    """Plain words for the family: what happens, how much, who receives it. Returns (en, kn, amount, recipient)."""
    amt = p.get("amount_inr")
    rupees = format_inr(amt) if amt else ""
    if action == "change_case_status":
        s = p["new_status"]
        return (
            f"{name}'s case will move to '{s.replace('_', ' ')}'.",
            f"{name} ಅವರ ಕಡತ '{STATUS_KN.get(s, s)}' ಹಂತಕ್ಕೆ ಹೋಗುತ್ತದೆ.",
            None,
            "",
        )
    if action == "submit_to_portal":
        n = len(p.get("document_ids") or [])
        return (
            f"{name}'s housing application and {n} document(s) will be sent to {p['portal']}.",
            f"{name} ಅವರ ಮನೆ ಅರ್ಜಿ ಮತ್ತು {n} ದಾಖಲೆ(ಗಳು) {p['portal']} ಗೆ ಕಳುಹಿಸಲಾಗುತ್ತದೆ.",
            None,
            p["portal"],
        )
    if action == "request_tranche":
        return (
            f"Ask for the {p['stage']} instalment of {rupees}, paid into {p['payee']}.",
            f"{p['stage']} ಹಂತದ {rupees} ಕಂತನ್ನು ಕೇಳಲಾಗುತ್ತದೆ. ಹಣ {p['payee']} ಗೆ ಬರುತ್ತದೆ.",
            amt,
            p["payee"],
        )
    if action == "accept_loan":
        terms = ""
        terms_kn = ""
        if p.get("rate_pa") is not None and p.get("months"):
            terms = f" at {p['rate_pa'] * 100:.1f}% a year for {p['months']} months"
            terms_kn = f", ವರ್ಷಕ್ಕೆ {p['rate_pa'] * 100:.1f}% ಬಡ್ಡಿ, {p['months']} ತಿಂಗಳು"
        return (
            f"{name} accepts a loan of {rupees} from {p['lender']}{terms}. It must be repaid.",
            f"{name} ಅವರು {p['lender']} ನಿಂದ {rupees} ಸಾಲ ಪಡೆಯುತ್ತಾರೆ{terms_kn}. ಇದನ್ನು ಮರುಪಾವತಿ ಮಾಡಬೇಕು.",
            amt,
            p["lender"],
        )
    if action == "pay_any_amount":
        return (
            f"Pay {rupees} to {p['payee']} for {p['purpose']}.",
            f"{p['purpose']} ಗಾಗಿ {p['payee']} ಅವರಿಗೆ {rupees} ಪಾವತಿ ಮಾಡಲಾಗುತ್ತದೆ.",
            amt,
            p["payee"],
        )
    if action == "share_documents_with_third_party":
        n = len(p["document_ids"])
        return (
            f"Share {n} of {name}'s document(s) with {p['recipient']} for {p['purpose']}.",
            f"{name} ಅವರ {n} ದಾಖಲೆ(ಗಳನ್ನು) {p['purpose']} ಗಾಗಿ {p['recipient']} ಅವರೊಂದಿಗೆ ಹಂಚಿಕೊಳ್ಳಲಾಗುತ್ತದೆ.",
            None,
            p["recipient"],
        )
    raise KeyError(action)
