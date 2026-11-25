"""A scripted provider for demos and tests. It follows a YAML script, not a model.

A script has `steps` and `recover`. Steps run in order. When a tool fails with error code X, the
provider switches to `recover[X]`; with no handler it finishes and reports the error. Strings may use
{{tool.field}} from earlier results in this run, with |inr to format rupees, so every figure in a
message comes from a tool.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from ...lib_money import format_inr
from .base import Decision, Turn

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
_PLACEHOLDER = re.compile(r"\{\{\s*([a-z_]+)\.([a-z_0-9.]+)\s*(\|\s*inr)?\s*\}\}")


def load_script(name: str) -> dict:
    path = SCRIPTS / f"{name}.yaml"
    if not re.fullmatch(r"[a-z0-9_]+", name) or not path.exists():
        raise ValueError(f"No mock script named '{name}'")
    return yaml.safe_load(path.read_text(encoding="utf-8"))


class MockProvider:
    name = "mock"

    def __init__(self, script: str = "case_review"):
        self.script_name = script
        self.script = load_script(script)
        self.queue: list[dict] = list(self.script["steps"])
        self.handled = 0

    def _results(self, turn: Turn) -> dict[str, Any]:
        out: dict[str, Any] = {"case": {"id": turn.case_id}}
        for _, obs in turn.history:
            if obs.tool and obs.result is not None:
                out[obs.tool] = obs.result
        return out

    def _fill(self, value: Any, results: dict) -> Any:
        if isinstance(value, str):
            if value == "{{case.id}}":
                return results["case"]["id"]

            def sub(m: re.Match) -> str:
                node: Any = results.get(m.group(1), {})
                for part in m.group(2).split("."):
                    node = node[int(part)] if isinstance(node, list) else node.get(part)
                return format_inr(node) if m.group(3) else str(node)

            return _PLACEHOLDER.sub(sub, value)
        if isinstance(value, dict):
            return {k: self._fill(v, results) for k, v in value.items()}
        if isinstance(value, list):
            return [self._fill(v, results) for v in value]
        return value

    def decide(self, turn: Turn) -> Decision:
        last = turn.last
        if last is not None and last.error and self.handled < len(turn.history):
            self.handled = len(turn.history)
            handler = self.script.get("recover", {}).get(last.error)
            if handler is None:
                return Decision(
                    thought_summary=f"No recovery for {last.error}; stopping.",
                    message_en=f"Stopped: {last.message}",
                    message_kn=f"ನಿಲ್ಲಿಸಲಾಗಿದೆ: {last.message}",
                    status="done",
                )
            self.queue = list(handler)
        if not self.queue:
            return Decision(thought_summary="Script finished.", status="done", message_en="Done.", message_kn="ಮುಗಿದಿದೆ.")
        step = self._fill(self.queue.pop(0), self._results(turn))
        return Decision.model_validate(step)
