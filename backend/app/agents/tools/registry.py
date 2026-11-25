"""The tool registry: the only way a model can touch a case.

A tool is a plain function with typed input and output models. The model chooses a tool and its
arguments; the server validates them, runs the function, and writes an audit row for every call
(arguments hash, result hash, milliseconds). A tool's side effect is declared up front:

- "none":  reads or computes only.
- "write": adds a low-risk record that changes no status or money (a task).
- "gated": may only create a pending approval request. Approving it is a person's job.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from ...core.audit import write_audit

SideEffect = Literal["none", "write", "gated"]


@dataclass
class ToolContext:
    db: Session
    actor: str
    run_id: int | None = None


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_model: type[BaseModel]
    output_model: type[BaseModel]
    side_effect: SideEffect
    fn: Callable[[ToolContext, Any], BaseModel]

    def spec(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "side_effect": self.side_effect,
            "input_schema": self.input_model.model_json_schema(),
            "output_schema": self.output_model.model_json_schema(),
        }


REGISTRY: dict[str, Tool] = {}


class ToolError(Exception):
    """A tool refused or failed. `code` is stable for the runtime's recovery step."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def tool(
    name: str, description: str, input_model: type[BaseModel], output_model: type[BaseModel], side_effect: SideEffect
):
    def register(fn: Callable[[ToolContext, Any], BaseModel]):
        if name in REGISTRY:
            raise ValueError(f"Tool '{name}' registered twice")
        REGISTRY[name] = Tool(name, description, input_model, output_model, side_effect, fn)
        return fn

    return register


def _digest(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()[:16]


def call_tool(ctx: ToolContext, name: str, args: dict) -> dict:
    """Validate, run, audit. Raises ToolError with a stable code; never returns partial output."""
    t = REGISTRY.get(name)
    if t is None:
        raise ToolError("unknown_tool", f"No tool named '{name}'")
    try:
        parsed = t.input_model.model_validate(args)
    except ValidationError as exc:
        raise ToolError("invalid_arguments", exc.errors(include_url=False).__repr__()) from exc
    started = time.perf_counter()
    case_id = getattr(parsed, "case_id", None)
    out: dict = {}
    status = "error"
    try:
        out = t.output_model.model_validate(t.fn(ctx, parsed)).model_dump(mode="json")
        status = "ok"
    finally:
        ms = round((time.perf_counter() - started) * 1000, 2)
        detail = {
            "tool": name,
            "side_effect": t.side_effect,
            "status": status,
            "args_sha": _digest(args),
            "result_sha": _digest(out) if status == "ok" else None,
            "ms": ms,
            "run_id": ctx.run_id,
        }
        write_audit(ctx.db, f"tool:{name}", case_id, json.dumps(detail), ctx.actor)
        ctx.db.commit()
    return out


def tool_specs() -> list[dict]:
    return [REGISTRY[n].spec() for n in sorted(REGISTRY)]
