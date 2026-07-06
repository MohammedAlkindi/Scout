"""Live weather conditions via Open-Meteo (https://open-meteo.com).

ASSUMPTION: Open-Meteo was chosen over a paid provider (OpenWeatherMap,
Tomorrow.io, etc.) specifically because it is free and keyless -- this
project should run with zero signup friction. If a paid provider is ever
swapped in, only this module changes; callers depend on WeatherSnapshot /
ConditionsResult, not on Open-Meteo's response shape.

All timestamps are requested and interpreted as UTC (see golden_hour.py
for the same convention across the codebase).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter

import httpx

from server import config
from server.errors import UpstreamServiceError
from server.observability import record_upstream_call
from server.rate_limiter import TokenBucket
from server.services.scorer import WeatherSnapshot

_rate_limiter = TokenBucket(config.WEATHER_RATE_LIMIT_MAX_CALLS, config.WEATHER_RATE_LIMIT_PER_SECONDS)


@dataclass(frozen=True)
class ForecastHour:
    time: datetime
    cloud_cover_pct: float
    wind_speed_mph: float
    visibility_miles: float
    precipitation_probability_pct: float
    temperature_f: float


@dataclass(frozen=True)
class ConditionsResult:
    current: WeatherSnapshot
    forecast_24h: list[ForecastHour]


def _meters_to_miles(meters: float) -> float:
    return meters / 1609.344


def _parse_conditions(data: dict) -> ConditionsResult:
    try:
        current_block = data["current"]
        hourly = data["hourly"]
        hourly_times: list[str] = hourly["time"]

        # `current.time` has minute granularity (e.g. "...T15:15") while
        # `hourly.time` entries are on the hour, so they rarely match
        # exactly -- find the closest hourly slot instead of exact string
        # equality.
        current_dt = datetime.fromisoformat(current_block["time"])
        parsed_hourly = [datetime.fromisoformat(t) for t in hourly_times]
        nearest_index = min(
            range(len(parsed_hourly)), key=lambda i: abs((parsed_hourly[i] - current_dt).total_seconds())
        )

        current = WeatherSnapshot(
            cloud_cover_pct=float(current_block["cloud_cover"]),
            wind_speed_mph=float(current_block["wind_speed_10m"]),
            visibility_miles=_meters_to_miles(float(hourly["visibility"][nearest_index])),
            precipitation_probability_pct=float(hourly["precipitation_probability"][nearest_index]),
            temperature_f=float(current_block["temperature_2m"]),
        )

        forecast = [
            ForecastHour(
                time=datetime.fromisoformat(hourly_times[i]).replace(tzinfo=timezone.utc),
                cloud_cover_pct=float(hourly["cloud_cover"][i]),
                wind_speed_mph=float(hourly["wind_speed_10m"][i]),
                visibility_miles=_meters_to_miles(float(hourly["visibility"][i])),
                precipitation_probability_pct=float(hourly["precipitation_probability"][i]),
                temperature_f=float(hourly["temperature_2m"][i]),
            )
            for i in range(nearest_index, min(nearest_index + 24, len(hourly_times)))
        ]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise UpstreamServiceError("Weather data is temporarily unavailable.") from exc

    return ConditionsResult(current=current, forecast_24h=forecast)


async def fetch_conditions(lat: float, lng: float) -> ConditionsResult:
    """Fetch current conditions and a 24h hourly forecast for a location.

    Raises UpstreamServiceError on any network failure, timeout, or
    unexpected response shape -- callers never see raw httpx exceptions.
    """
    await _rate_limiter.acquire()

    params = {
        "latitude": lat,
        "longitude": lng,
        "current": "temperature_2m,cloud_cover,wind_speed_10m",
        "hourly": "temperature_2m,cloud_cover,wind_speed_10m,visibility,precipitation_probability",
        "forecast_days": 2,
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "timezone": "UTC",
    }

    started = perf_counter()
    try:
        async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(config.OPEN_METEO_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()
            record_upstream_call("open_meteo", "success", round((perf_counter() - started) * 1000), response.status_code)
    except httpx.HTTPStatusError as exc:
        record_upstream_call(
            "open_meteo",
            "http_error",
            round((perf_counter() - started) * 1000),
            exc.response.status_code,
        )
        raise UpstreamServiceError("Weather data is temporarily unavailable.") from exc
    except httpx.TimeoutException as exc:
        record_upstream_call("open_meteo", "timeout", round((perf_counter() - started) * 1000))
        raise UpstreamServiceError("Weather data is temporarily unavailable.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        record_upstream_call("open_meteo", "error", round((perf_counter() - started) * 1000))
        raise UpstreamServiceError("Weather data is temporarily unavailable.") from exc

    return _parse_conditions(data)
