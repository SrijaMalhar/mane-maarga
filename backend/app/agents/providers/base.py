"""What every model provider returns, and the turn it is given.

The model never runs anything. Each turn it returns one decision: a short summary of its reasoning,
at most one tool call, a message in English and Kannada, the clause IDs it relies on, and whether it
wants to continue, ask the operator a question, or finish.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field


class Action(BaseModel):
    tool: str = Field(min_length=1, max_length=60)
    args: dict[str, Any] = Field(default_factory=dict)


class Decision(BaseModel):
    thought_summary: str = Field(default="", max_length=600)
    action: Action | None = None
    message_en: str = Field(default="", max_length=2000)
    message_kn: str = Field(default="", max_length=3000)
    citations: list[str] = Field(default_factory=list, max_length=20)
    status: Literal["continue", "ask", "done"] = "continue"


@dataclass
class Observation:
    """What happened after a decision: a tool result, a tool error, or a guard refusal."""

    tool: str | None
    result: dict | None = None
    error: str | None = None
    message: str = ""
    model_view: dict | None = None  # the result as the model sees it: untrusted text wrapped as data
    flags: list[str] = field(default_factory=list)


@dataclass
class Turn:
    case_id: int
    goal: str
    language: str
    system_prompt: str
    tools: list[dict]
    history: list[tuple[Decision, Observation]] = field(default_factory=list)

    @property
    def last(self) -> Observation | None:
        return self.history[-1][1] if self.history else None


class Provider(Protocol):
    name: str

    def decide(self, turn: Turn) -> Decision: ...


class ProviderError(Exception):
    """The provider could not produce a decision (network, quota, unparseable output)."""
