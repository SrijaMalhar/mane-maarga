"""Lyzr Agent Studio as the model. It only returns decisions; the server runs every tool.

Configure MANE_MAARGA_LYZR_API_KEY (or LYZR_API_KEY) and MANE_MAARGA_LYZR_AGENT_ID. The agent in
Lyzr Studio should be created with the system prompt from app/agents/prompts and told to answer
with one JSON object per turn.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from collections.abc import Callable

from pydantic import ValidationError

from ...core.config import env
from .base import Decision, ProviderError, Turn

URL = "https://agent-prod.studio.lyzr.ai/v3/inference/chat/"
Post = Callable[[str, dict, dict, float], dict]


def _urllib_post(url: str, headers: dict, body: dict, timeout: float) -> dict:
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed https URL)
        return json.loads(resp.read().decode())


def parse_decision(text: str) -> Decision:
    """Accept a bare JSON object or one inside a ```json fence; anything else is an error."""
    m = re.search(r"\{.*\}", text or "", re.DOTALL)
    if not m:
        raise ProviderError("The model did not return a JSON object")
    try:
        return Decision.model_validate(json.loads(m.group(0)))
    except (json.JSONDecodeError, ValidationError) as exc:
        raise ProviderError(f"The model returned an invalid decision: {exc}") from exc


class LyzrProvider:
    name = "lyzr"

    def __init__(
        self,
        api_key: str | None = None,
        agent_id: str | None = None,
        user_id: str = "mane-maarga",
        post: Post | None = None,
        retries: int = 2,
        timeout: float = 45.0,
        backoff: float = 1.0,
    ):
        self.api_key = api_key or env("LYZR_API_KEY") or os.getenv("LYZR_API_KEY")
        self.agent_id = agent_id or env("LYZR_AGENT_ID") or os.getenv("LYZR_AGENT_ID")
        if not self.api_key or not self.agent_id:
            raise ProviderError("Lyzr is not configured: set MANE_MAARGA_LYZR_API_KEY and MANE_MAARGA_LYZR_AGENT_ID")
        self.user_id = user_id
        self.post = post or _urllib_post
        self.retries = retries
        self.timeout = timeout
        self.backoff = backoff

    def message_for(self, turn: Turn) -> str:
        history = [
            {
                "decision": d.model_dump(),
                "observation": {
                    "tool": o.tool,
                    "result": o.model_view if o.model_view is not None else o.result,
                    "error": o.error,
                    "message": o.message,
                },
            }
            for d, o in turn.history
        ]
        return json.dumps(
            {
                "instructions": turn.system_prompt,
                "case_id": turn.case_id,
                "goal": turn.goal,
                "language": turn.language,
                "tools": [
                    {k: t[k] for k in ("name", "description", "side_effect", "input_schema")} for t in turn.tools
                ],
                "history": history,
                "reply_with": "one JSON decision object",
            },
            ensure_ascii=False,
        )

    def decide(self, turn: Turn) -> Decision:
        body = {
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "session_id": f"case-{turn.case_id}-{id(turn)}",
            "message": self.message_for(turn),
        }
        headers = {"Content-Type": "application/json", "x-api-key": self.api_key}
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                data = self.post(URL, headers, body, self.timeout)
                return parse_decision(data.get("response") if isinstance(data, dict) else str(data))
            except (urllib.error.URLError, TimeoutError, ProviderError, OSError) as exc:
                last = exc
                if attempt < self.retries:
                    time.sleep(self.backoff * (attempt + 1))
        raise ProviderError(f"Lyzr failed after {self.retries + 1} attempts: {last}")
