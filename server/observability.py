"""Privacy-safe structured telemetry for Scout.

Scout has no database and no account system, so production readiness starts
with useful process-local counters and structured logs. This module records
outcomes, latency, and coarse location buckets without storing raw user
intent text or precise coordinate history.
"""

from __future__ import annotations

import json
import logging
import threading
from collections import Counter, deque
from datetime import datetime, timezone
from typing import Mapping

logger = logging.getLogger("scout.telemetry")

_MAX_RECENT_EVENTS = 40
_JsonScalar = str | int | float | bool | None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_value(value: object) -> _JsonScalar:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _status_family(status_code: int) -> str:
    return f"{status_code // 100}xx"


def coordinate_bucket(latitude: float, longitude: float) -> str:
    """Coarse coordinate bucket, roughly city-scale rather than address-scale."""
    return f"{round(latitude, 1):.1f},{round(longitude, 1):.1f}"


def radius_bucket(radius_miles: float) -> str:
    if radius_miles <= 5:
        return "0-5"
    if radius_miles <= 15:
        return "5-15"
    if radius_miles <= 30:
        return "15-30"
    return "30+"


class Telemetry:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counters: Counter[str] = Counter()
        self._recent_events: deque[dict[str, _JsonScalar]] = deque(maxlen=_MAX_RECENT_EVENTS)

    def record(self, event_name: str, fields: Mapping[str, object] | None = None) -> None:
        event: dict[str, _JsonScalar] = {"event": event_name, "at": _now_iso()}
        for key, value in (fields or {}).items():
            event[key] = _safe_value(value)

        with self._lock:
            self._counters[event_name] += 1
            self._recent_events.append(event)

        logger.info(json.dumps(event, sort_keys=True, separators=(",", ":")))

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            counters = dict(self._counters)
            recent_events = list(self._recent_events)
        return {
            "status": "ok",
            "generated_at": _now_iso(),
            "counters": counters,
            "recent_events": recent_events,
        }


telemetry = Telemetry()


def record_http_request(method: str, path: str, status_code: int, elapsed_ms: int) -> None:
    family = _status_family(status_code)
    telemetry.record(
        "http_request",
        {
            "method": method,
            "path": path,
            "status_code": status_code,
            "status_family": family,
            "elapsed_ms": elapsed_ms,
        },
    )
    telemetry.record(f"http_request.{method}.{path}.{family}")


def record_scout_error(path: str, error_type: str, status_code: int) -> None:
    telemetry.record(
        "scout_error",
        {
            "path": path,
            "error_type": error_type,
            "status_code": status_code,
            "status_family": _status_family(status_code),
        },
    )


def record_upstream_call(provider: str, outcome: str, elapsed_ms: int, status_code: int | None = None) -> None:
    fields: dict[str, object] = {
        "provider": provider,
        "outcome": outcome,
        "elapsed_ms": elapsed_ms,
    }
    if status_code is not None:
        fields["status_code"] = status_code
        fields["status_family"] = _status_family(status_code)
    telemetry.record("upstream_call", fields)
    telemetry.record(f"upstream_call.{provider}.{outcome}")


def record_recommendation(
    latitude: float,
    longitude: float,
    radius_miles: float,
    shot_type: str,
    count: int,
    demo_mode: bool,
    elapsed_ms: int,
    top_score: int | None,
) -> None:
    fields: dict[str, object] = {
        "coordinate_bucket": coordinate_bucket(latitude, longitude),
        "radius_bucket": radius_bucket(radius_miles),
        "shot_type": shot_type,
        "count": count,
        "demo_mode": demo_mode,
        "elapsed_ms": elapsed_ms,
    }
    if top_score is not None:
        fields["top_score"] = top_score
    telemetry.record("recommendation_complete", fields)
    telemetry.record(f"recommendation_complete.{shot_type}")
