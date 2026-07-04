"""Structured error types shared by the MCP layer and the HTTP layer.

Every external-facing failure must map to one of these before it reaches a
client. Raw exceptions from httpx, JSON parsing, or third-party APIs are
caught at the service boundary and re-raised as one of these with a safe,
generic message -- never with upstream response bodies or stack traces.
"""

from __future__ import annotations


class ScoutError(Exception):
    """Base class for all errors Scout intentionally raises and handles."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidRequestError(ScoutError):
    """The caller supplied invalid input (bad coordinates, bad date, etc.)."""


class UpstreamServiceError(ScoutError):
    """A third-party API (weather/location provider) failed or timed out."""


class RateLimitedError(ScoutError):
    """A rate limit (ours or the upstream's) was exceeded."""


class NoCandidatesFoundError(ScoutError):
    """No locations matched the requested area or intent."""
