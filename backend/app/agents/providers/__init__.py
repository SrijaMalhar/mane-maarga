"""Model providers. The mock follows a script; Lyzr calls a hosted agent. Neither runs tools."""

from .base import Action, Decision, Observation, Provider, ProviderError, Turn
from .lyzr import LyzrProvider
from .mock import MockProvider


def get_provider(name: str, script: str = "case_review") -> Provider:
    if name == "mock":
        return MockProvider(script)
    if name == "lyzr":
        return LyzrProvider()
    raise ProviderError(f"Unknown provider '{name}'")


__all__ = [
    "Action",
    "Decision",
    "LyzrProvider",
    "MockProvider",
    "Observation",
    "Provider",
    "ProviderError",
    "Turn",
    "get_provider",
]
