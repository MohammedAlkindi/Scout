"""In-memory TTL cache for external API responses.

Keeps repeated requests (e.g. multiple users near the same coordinates)
from re-hitting third-party APIs within their data's natural freshness
window. Single-process and unpersisted -- Scout has no multi-instance
deployment target, so a distributed cache (Redis, etc.) would be
complexity with no payoff at this scale.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")


@dataclass
class _Entry(Generic[T]):
    value: T
    expires_at: float


class TTLCache(Generic[T]):
    """Async-safe TTL cache keyed by string, with per-key locking.

    Per-key locks (rather than one global lock) mean an in-flight fetch
    for one cache key never blocks a concurrent request for a different
    key -- only concurrent requests for the *same* key wait on each other,
    so a fetch only happens once even under a stampede.
    """

    def __init__(self) -> None:
        self._store: dict[str, _Entry[T]] = {}
        self._key_locks: dict[str, asyncio.Lock] = {}
        self._locks_guard = asyncio.Lock()

    def _get_fresh(self, key: str) -> T | None:
        entry = self._store.get(key)
        if entry is None:
            return None
        if entry.expires_at < time.monotonic():
            del self._store[key]
            return None
        return entry.value

    async def _lock_for(self, key: str) -> asyncio.Lock:
        async with self._locks_guard:
            lock = self._key_locks.get(key)
            if lock is None:
                lock = asyncio.Lock()
                self._key_locks[key] = lock
            return lock

    async def get_or_fetch(self, key: str, ttl_seconds: float, fetch: Callable[[], Awaitable[T]]) -> T:
        cached = self._get_fresh(key)
        if cached is not None:
            return cached

        lock = await self._lock_for(key)
        async with lock:
            # Re-check: another request may have populated this key while
            # we were waiting for the lock.
            cached = self._get_fresh(key)
            if cached is not None:
                return cached
            value = await fetch()
            self._store[key] = _Entry(value=value, expires_at=time.monotonic() + ttl_seconds)
            return value

    def invalidate(self, key: str) -> None:
        self._store.pop(key, None)

    def clear(self) -> None:
        self._store.clear()
