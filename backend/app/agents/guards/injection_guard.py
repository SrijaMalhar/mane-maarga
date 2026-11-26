"""Injection guard: text that came from documents, uploads or messages is data, never an instruction.

Before a tool result is shown to the model, every string in it is wrapped as
<untrusted_data source="..."> ... </untrusted_data>, with any look-alike tags inside defused, and the
system prompt says such content is never to be followed. Phrases that look like instructions are flagged
so the trace shows them. The flag never blocks a case; it records and warns.
"""

from __future__ import annotations

import re
from typing import Any

# Tools whose results carry text a family, a document or an outsider wrote.
UNTRUSTED_TOOLS = {"get_case", "list_documents", "check_documents", "draft_message"}

_PATTERNS = [
    r"ignore (all |any |the )?(previous|prior|above) (instructions|rules)",
    r"disregard (the |all )?(rules|instructions|system prompt)",
    r"you are now",
    r"system prompt",
    r"developer mode",
    r"\b(approve|execute|pay|transfer|submit)\b.{0,40}\b(now|immediately|without (asking|approval|otp))",
    r"request_approval|change_case_status|pay_any_amount",
    r"</?untrusted_data",
    r"<\s*/?\s*(system|assistant|tool)\s*>",
    r"ಹಿಂದಿನ ಸೂಚನೆ",
    r"ಅನುಮತಿ ಇಲ್ಲದೆ",
]
_RX = re.compile("|".join(_PATTERNS), re.IGNORECASE)
_TAG = re.compile(r"<\s*/?\s*untrusted_data[^>]*>", re.IGNORECASE)


def scan(text: str) -> list[str]:
    return [m.group(0) for m in _RX.finditer(text or "")]


def wrap(text: str, source: str) -> str:
    clean = _TAG.sub("[removed tag]", text)
    return f'<untrusted_data source="{source}">{clean}</untrusted_data>'


def guard_result(tool: str, result: Any) -> tuple[Any, list[str]]:
    """The model's view of a tool result, plus any instruction-like phrases found in it."""
    if tool not in UNTRUSTED_TOOLS:
        return result, []
    flags: list[str] = []

    def walk(v: Any, path: str) -> Any:
        if isinstance(v, str):
            flags.extend(scan(v))
            return wrap(v, f"{tool}.{path}")
        if isinstance(v, dict):
            return {k: walk(x, f"{path}.{k}" if path else k) for k, x in v.items()}
        if isinstance(v, list):
            return [walk(x, f"{path}[{i}]") for i, x in enumerate(v)]
        return v

    return walk(result, ""), flags
