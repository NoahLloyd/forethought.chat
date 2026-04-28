"""Abstract Judge interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class JudgeRequest(BaseModel):
    """A single judge call.

    `cache_system` enables Anthropic prompt caching on the system prompt -
    valuable when the same rubric system is reused across many items in a
    run. Backends that don't support caching ignore the flag.
    """

    system: str
    user: str
    temperature: float = 0.0
    max_tokens: int = 1024
    cache_system: bool = True


class JudgeResponse(BaseModel):
    text: str
    model: str  # echoed for telemetry
    usage: dict[str, Any] = Field(default_factory=dict)


class Judge(ABC):
    """All judges expose `complete(req) -> response`. Aggregation lives in
    JudgeEnsemble; individual judges are stateless."""

    name: str
    model: str

    @abstractmethod
    async def complete(self, req: JudgeRequest) -> JudgeResponse:
        """Run one judge call. Implementations should be deterministic at
        temperature=0; runs at higher temperatures are caller-controlled."""
        raise NotImplementedError
