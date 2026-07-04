"""Centralized environment-variable configuration.

All external service endpoints and tunables are read here once so no other
module reaches into ``os.environ`` directly.

ASSUMPTION: Scout deliberately uses free, keyless APIs -- Open-Meteo for
weather and OpenStreetMap Overpass for locations -- so the project runs
with zero API keys and zero signup friction. The environment variables
below only override hosting endpoints, timeouts, and rate limits; there is
nothing secret to configure.
"""

from __future__ import annotations

import os


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    return float(raw) if raw else default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw) if raw else default


OPEN_METEO_BASE_URL = os.environ.get("OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast")
OVERPASS_BASE_URL = os.environ.get("OVERPASS_BASE_URL", "https://overpass-api.de/api/interpreter")

# Overpass blocks requests without a descriptive User-Agent.
HTTP_USER_AGENT = os.environ.get("SCOUT_HTTP_USER_AGENT", "Scout/1.0 (photography recommendation tool)")

HTTP_TIMEOUT_SECONDS = _env_float("SCOUT_HTTP_TIMEOUT_SECONDS", 12.0)

# Current conditions drift within minutes; geography does not.
WEATHER_CACHE_TTL_SECONDS = _env_int("SCOUT_WEATHER_CACHE_TTL_SECONDS", 600)
LOCATIONS_CACHE_TTL_SECONDS = _env_int("SCOUT_LOCATIONS_CACHE_TTL_SECONDS", 86400)

WEATHER_RATE_LIMIT_MAX_CALLS = _env_int("SCOUT_WEATHER_RATE_LIMIT_MAX_CALLS", 20)
WEATHER_RATE_LIMIT_PER_SECONDS = _env_float("SCOUT_WEATHER_RATE_LIMIT_PER_SECONDS", 60.0)

LOCATIONS_RATE_LIMIT_MAX_CALLS = _env_int("SCOUT_LOCATIONS_RATE_LIMIT_MAX_CALLS", 10)
LOCATIONS_RATE_LIMIT_PER_SECONDS = _env_float("SCOUT_LOCATIONS_RATE_LIMIT_PER_SECONDS", 60.0)

# Applied per client IP in the HTTP API layer, protecting both our backend
# and the free upstream providers from being hammered through it.
API_CLIENT_RATE_LIMIT_MAX_CALLS = _env_int("SCOUT_API_CLIENT_RATE_LIMIT_MAX_CALLS", 30)
API_CLIENT_RATE_LIMIT_PER_SECONDS = _env_float("SCOUT_API_CLIENT_RATE_LIMIT_PER_SECONDS", 60.0)
