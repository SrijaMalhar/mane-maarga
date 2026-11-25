"""Rupee formatting with Indian digit grouping (1,20,000), shared by messages and guards."""

from __future__ import annotations

import re


def format_inr(value: float | int | None) -> str:
    if value is None:
        return "₹—"
    n = round(float(value))
    sign, s = ("-" if n < 0 else ""), str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return f"{sign}₹{s}"


_AMOUNT = re.compile(r"(?:₹|Rs\.?\s?|INR\s?)\s?(\d[\d,]*(?:\.\d+)?)(\s?(?:lakh|lakhs|ಲಕ್ಷ))?", re.IGNORECASE)


def amounts_in(text: str) -> list[int]:
    """Every rupee figure written in a message, as whole rupees. '1.2 lakh' counts as 120000."""
    found = []
    for m in _AMOUNT.finditer(text or ""):
        value = float(m.group(1).replace(",", ""))
        if m.group(2):
            value *= 100_000
        found.append(round(value))
    return found
