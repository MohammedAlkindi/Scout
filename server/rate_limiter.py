"""In-process token-bucket rate limiting.

Two usage patterns are needed:
  - outbound calls to a third-party API should smooth out bursts by
    waiting for a token (``acquire``) rather than failing, since it's our
    own traffic we're shaping;
  - inbound requests from web clients should fail fast with a 429
    (``try_acquire``) rather than piling up connections waiting.

One class supports both since the bucket math is identical; only the
caller's response to "no tokens left" differs.
"""

from __future__ import annotations

import asyncio
import time


class TokenBucket:
    def __init__(self, max_calls: int, per_seconds: float) -> None:
        if max_calls <= 0 or per_seconds <= 0:
            raise ValueError("max_calls and per_seconds must be positive")
        self._max_calls = float(max_calls)
        self._refill_rate = max_calls / per_seconds  # tokens per second
        self._tokens = float(max_calls)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._last_refill
        self._last_refill = now
        self._tokens = min(self._max_calls, self._tokens + elapsed * self._refill_rate)

    async def try_acquire(self) -> bool:
        """Non-blocking: consume a token if available, else return False immediately."""
        async with self._lock:
            self._refill()
            if self._tokens >= 1:
                self._tokens -= 1
                return True
            return False

    async def acquire(self) -> None:
        """Blocking: wait until a token is available, then consume it."""
        while True:
            async with self._lock:
                self._refill()
                if self._tokens >= 1:
                    self._tokens -= 1
                    return
                wait_time = (1 - self._tokens) / self._refill_rate
            await asyncio.sleep(wait_time)
