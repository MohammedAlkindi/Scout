"""Core orchestration for Scout's five tools.

Both the MCP layer (server/mcp_server.py) and the HTTP layer (server/api.py)
call into these functions instead of duplicating caching, rate limiting, or
error handling in two places. Everything here accepts/returns the shared
Pydantic schemas in server/schemas.py so both layers expose identical typed
shapes; the translation between service-layer dataclasses and those schemas
happens only in this module.

ASSUMPTION: `build_recommendation` scores every candidate location against
the *origin's* weather conditions rather than fetching per-location
weather. Candidates are constrained to a caller-supplied radius (default 15
miles) around the origin, over which cloud cover/wind/visibility do not
vary enough to justify one Open-Meteo call per candidate.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date as date_type, datetime, timedelta, timezone
from typing import Optional

from server import config
from server.cache import TTLCache
from server.errors import InvalidRequestError, UpstreamServiceError
from server.schemas import (
    ConditionsResponse,
    ForecastHourSchema,
    GoldenHourResponse,
    LocationCandidateSchema,
    LocationsResponse,
    RecommendationItem,
    RecommendationResponse,
    ScoreBreakdownSchema,
    ScoreWindowResponse,
    SolarEventSchema,
    TimeWindowSchema,
    WeatherSnapshotSchema,
)
from server.services import golden_hour as golden_hour_service
from server.services import locations as locations_service
from server.services import weather as weather_service
from server.services.golden_hour import GoldenHourResult, SolarEvent, TimeWindow as GHTimeWindow, classify_window
from server.services.locations import LocationCandidate
from server.services.scorer import (
    CrowdLevel,
    LightPhase,
    LocationConditions,
    ScoreResult,
    ShotType,
    WeatherSnapshot,
    WindowLightContext,
)
from server.services.scorer import score_window as compute_score
from server.services.weather import ConditionsResult, ForecastHour

_conditions_cache: TTLCache[ConditionsResult] = TTLCache()
_locations_cache: TTLCache[list[LocationCandidate]] = TTLCache()

MAX_RECOMMENDATIONS = 3
DEFAULT_RADIUS_MILES = 15.0
DEFAULT_LOCATION_LIMIT = 10
_CACHE_KEY_COORD_PRECISION = 3  # ~110m grouping: close enough to share a cache entry


def _validate_latlng(latitude: float, longitude: float) -> None:
    if not (-90.0 <= latitude <= 90.0):
        raise InvalidRequestError(f"latitude must be between -90 and 90, got {latitude}")
    if not (-180.0 <= longitude <= 180.0):
        raise InvalidRequestError(f"longitude must be between -180 and 180, got {longitude}")


def _round_coord(value: float) -> float:
    return round(value, _CACHE_KEY_COORD_PRECISION)


# ---------------------------------------------------------------------------
# get_golden_hour
# ---------------------------------------------------------------------------


def _solar_event_to_schema(event: SolarEvent) -> SolarEventSchema:
    return SolarEventSchema(time_utc=event.time, azimuth_deg=round(event.azimuth_deg, 1))


def _time_window_to_schema(window: Optional[GHTimeWindow]) -> Optional[TimeWindowSchema]:
    if window is None:
        return None
    return TimeWindowSchema(start_utc=window.start, end_utc=window.end)


def get_golden_hour(latitude: float, longitude: float, on_date: date_type) -> GoldenHourResponse:
    """Sunrise, sunset, golden hour, blue hour, and solar noon for a location and date."""
    _validate_latlng(latitude, longitude)
    result = golden_hour_service.compute_golden_hour(latitude, longitude, on_date)
    return GoldenHourResponse(
        latitude=result.latitude,
        longitude=result.longitude,
        date=result.date,
        sunrise=_solar_event_to_schema(result.sunrise),
        sunset=_solar_event_to_schema(result.sunset),
        solar_noon=_solar_event_to_schema(result.solar_noon),
        golden_hour_morning=_time_window_to_schema(result.golden_hour_morning),
        golden_hour_evening=_time_window_to_schema(result.golden_hour_evening),
        blue_hour_morning=_time_window_to_schema(result.blue_hour_morning),
        blue_hour_evening=_time_window_to_schema(result.blue_hour_evening),
        day_length_hours=result.day_length_hours,
        polar_day=result.polar_day,
        polar_night=result.polar_night,
    )


# ---------------------------------------------------------------------------
# get_conditions
# ---------------------------------------------------------------------------


def _weather_snapshot_to_schema(snapshot: WeatherSnapshot) -> WeatherSnapshotSchema:
    return WeatherSnapshotSchema(
        cloud_cover_pct=snapshot.cloud_cover_pct,
        wind_speed_mph=snapshot.wind_speed_mph,
        visibility_miles=round(snapshot.visibility_miles, 1),
        precipitation_probability_pct=snapshot.precipitation_probability_pct,
        temperature_f=snapshot.temperature_f,
    )


def _forecast_hour_to_schema(hour: ForecastHour) -> ForecastHourSchema:
    return ForecastHourSchema(
        time_utc=hour.time,
        cloud_cover_pct=hour.cloud_cover_pct,
        wind_speed_mph=hour.wind_speed_mph,
        visibility_miles=round(hour.visibility_miles, 1),
        precipitation_probability_pct=hour.precipitation_probability_pct,
        temperature_f=hour.temperature_f,
    )


async def _fetch_conditions_cached(latitude: float, longitude: float) -> ConditionsResult:
    key = f"conditions:{_round_coord(latitude)}:{_round_coord(longitude)}"
    return await _conditions_cache.get_or_fetch(
        key,
        config.WEATHER_CACHE_TTL_SECONDS,
        lambda: weather_service.fetch_conditions(latitude, longitude),
    )


async def get_conditions(latitude: float, longitude: float) -> ConditionsResponse:
    """Current weather and a 24-hour hourly forecast for a location."""
    _validate_latlng(latitude, longitude)
    result = await _fetch_conditions_cached(latitude, longitude)
    return ConditionsResponse(
        latitude=latitude,
        longitude=longitude,
        current=_weather_snapshot_to_schema(result.current),
        forecast_24h=[_forecast_hour_to_schema(h) for h in result.forecast_24h],
    )


# ---------------------------------------------------------------------------
# get_locations
# ---------------------------------------------------------------------------


def _candidate_to_schema(candidate: LocationCandidate) -> LocationCandidateSchema:
    return LocationCandidateSchema(
        name=candidate.name,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        distance_miles=candidate.distance_miles,
        terrain_type=candidate.terrain_type,
        accessibility_notes=candidate.accessibility_notes,
        permit_required=candidate.permit_required,
        permit_notes=candidate.permit_notes,
        crowd_level=candidate.crowd_level,
        image_url=candidate.image_url,
        image_attribution=candidate.image_attribution,
    )


async def _find_locations_cached(
    latitude: float, longitude: float, radius_miles: float, intent: str, limit: int
) -> list[LocationCandidate]:
    key = (
        f"locations:{_round_coord(latitude)}:{_round_coord(longitude)}:"
        f"{radius_miles}:{intent.strip().lower()}:{limit}"
    )
    return await _locations_cache.get_or_fetch(
        key,
        config.LOCATIONS_CACHE_TTL_SECONDS,
        lambda: locations_service.find_locations(latitude, longitude, radius_miles, intent, limit),
    )


async def get_locations(
    latitude: float, longitude: float, radius_miles: float, intent: str, limit: int = DEFAULT_LOCATION_LIMIT
) -> LocationsResponse:
    """Candidate locations near (latitude, longitude) matching a shot/activity description."""
    _validate_latlng(latitude, longitude)
    if radius_miles <= 0:
        raise InvalidRequestError("radius_miles must be positive")
    if not intent or not intent.strip():
        raise InvalidRequestError("intent must describe what you want to shoot or do")

    candidates = await _find_locations_cached(latitude, longitude, radius_miles, intent, limit)
    return LocationsResponse(
        latitude=latitude,
        longitude=longitude,
        radius_miles=radius_miles,
        intent=intent,
        candidates=[_candidate_to_schema(c) for c in candidates],
    )


# ---------------------------------------------------------------------------
# score_window
# ---------------------------------------------------------------------------


def _weather_snapshot_from_conditions(conditions: ConditionsResult, at: datetime) -> WeatherSnapshot:
    """Use the live snapshot for windows starting soon; otherwise the nearest forecast hour."""
    now = datetime.now(timezone.utc)
    if abs((at - now).total_seconds()) <= 1800 or not conditions.forecast_24h:
        return conditions.current
    nearest = min(conditions.forecast_24h, key=lambda h: abs((h.time - at).total_seconds()))
    return WeatherSnapshot(
        cloud_cover_pct=nearest.cloud_cover_pct,
        wind_speed_mph=nearest.wind_speed_mph,
        visibility_miles=nearest.visibility_miles,
        precipitation_probability_pct=nearest.precipitation_probability_pct,
        temperature_f=nearest.temperature_f,
    )


async def score_window(
    latitude: float,
    longitude: float,
    window_start: datetime,
    window_end: datetime,
    location_name: str = "This location",
    shot_type: ShotType = ShotType.LANDSCAPE,
    crowd_level: CrowdLevel = CrowdLevel.MEDIUM,
    permit_required: bool = False,
    accessibility_difficulty: float = 0.3,
) -> ScoreWindowResponse:
    """Score a location + time window against live conditions, 0-100 with a plain-English explanation.

    `crowd_level`, `permit_required`, and `accessibility_difficulty` default
    to moderate assumptions since a caller working from bare coordinates
    (rather than a candidate from `get_locations`) may not know them.
    """
    _validate_latlng(latitude, longitude)
    if window_end <= window_start:
        raise InvalidRequestError("window_end must be after window_start")

    golden = golden_hour_service.compute_golden_hour(latitude, longitude, window_start.date())
    light = classify_window(golden, window_start, window_end)

    conditions = await _fetch_conditions_cached(latitude, longitude)
    midpoint = window_start + (window_end - window_start) / 2
    weather = _weather_snapshot_from_conditions(conditions, midpoint)

    location = LocationConditions(
        name=location_name,
        crowd_level=crowd_level,
        permit_required=permit_required,
        accessibility_difficulty=accessibility_difficulty,
    )
    result = compute_score(location, light, weather, shot_type)

    return ScoreWindowResponse(
        score=result.score,
        explanation=result.explanation,
        light_phase=light.phase,
        breakdown=ScoreBreakdownSchema(
            light=result.breakdown.light,
            weather=result.breakdown.weather,
            crowd=result.breakdown.crowd,
            access=result.breakdown.access,
        ),
    )


# ---------------------------------------------------------------------------
# build_recommendation
# ---------------------------------------------------------------------------

_SHOT_TYPE_KEYWORDS: dict[ShotType, list[str]] = {
    ShotType.ASTRO: ["star", "astro", "milky way", "night sky"],
    ShotType.PORTRAIT: ["portrait", "headshot"],
    ShotType.WILDLIFE: ["wildlife", "bird", "animal"],
    ShotType.URBAN: ["urban", "street", "architecture", "skyline", "building"],
    ShotType.HIKING: ["hike", "hiking", "backpack", "trail run"],
}


def _infer_shot_type(intent: str) -> ShotType:
    text = intent.lower()
    for shot_type, keywords in _SHOT_TYPE_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            return shot_type
    return ShotType.LANDSCAPE


def _upcoming_light_windows(
    latitude: float, longitude: float, now: datetime
) -> list[tuple[GHTimeWindow, WindowLightContext]]:
    """Golden/blue hour windows still ahead today, or tomorrow morning's if today's have passed."""
    today = golden_hour_service.compute_golden_hour(latitude, longitude, now.date())
    named_today = [
        today.blue_hour_morning,
        today.golden_hour_morning,
        today.golden_hour_evening,
        today.blue_hour_evening,
    ]
    upcoming = [w for w in named_today if w is not None and w.end > now]
    golden: GoldenHourResult = today

    if not upcoming:
        golden = golden_hour_service.compute_golden_hour(latitude, longitude, now.date() + timedelta(days=1))
        upcoming = [w for w in [golden.blue_hour_morning, golden.golden_hour_morning] if w is not None]

    return [(window, classify_window(golden, window.start, window.end)) for window in upcoming]


def _conditions_summary(weather: WeatherSnapshot) -> str:
    return (
        f"{weather.cloud_cover_pct:.0f}% cloud cover, {weather.wind_speed_mph:.0f} mph wind, "
        f"{weather.visibility_miles:.0f} mi visibility, "
        f"{weather.precipitation_probability_pct:.0f}% chance of precipitation"
    )


@dataclass
class _RankedLocation:
    candidate: LocationCandidate
    window: GHTimeWindow
    light: WindowLightContext
    weather: WeatherSnapshot
    result: ScoreResult


async def build_recommendation(
    latitude: float,
    longitude: float,
    intent: str,
    radius_miles: float = DEFAULT_RADIUS_MILES,
    shot_type: Optional[ShotType] = None,
) -> RecommendationResponse:
    """Orchestrate golden hour + conditions + locations + scoring into top-3 recommendations."""
    _validate_latlng(latitude, longitude)
    if not intent or not intent.strip():
        raise InvalidRequestError("intent must describe what you want to shoot or do")
    if radius_miles <= 0:
        raise InvalidRequestError("radius_miles must be positive")

    resolved_shot_type = shot_type or _infer_shot_type(intent)
    now = datetime.now(timezone.utc)

    candidates = await _find_locations_cached(latitude, longitude, radius_miles, intent, DEFAULT_LOCATION_LIMIT)
    conditions = await _fetch_conditions_cached(latitude, longitude)
    window_light_pairs = _upcoming_light_windows(latitude, longitude, now)

    if not window_light_pairs:
        raise UpstreamServiceError("Could not determine an upcoming shoot window for this location.")

    window_contexts = [
        (window, light, _weather_snapshot_from_conditions(conditions, window.start + (window.end - window.start) / 2))
        for window, light in window_light_pairs
    ]

    ranked: list[_RankedLocation] = []
    for candidate in candidates:
        location = LocationConditions(
            name=candidate.name,
            crowd_level=candidate.crowd_level,
            permit_required=candidate.permit_required,
            accessibility_difficulty=candidate.accessibility_difficulty,
            distance_miles=candidate.distance_miles,
        )
        best: Optional[_RankedLocation] = None
        for window, light, weather in window_contexts:
            result = compute_score(location, light, weather, resolved_shot_type)
            if best is None or result.score > best.result.score:
                best = _RankedLocation(candidate=candidate, window=window, light=light, weather=weather, result=result)
        assert best is not None  # window_contexts is non-empty, guaranteed above
        ranked.append(best)

    ranked.sort(key=lambda item: item.result.score, reverse=True)
    top = ranked[:MAX_RECOMMENDATIONS]

    items = [
        RecommendationItem(
            rank=rank,
            location_name=item.candidate.name,
            latitude=item.candidate.latitude,
            longitude=item.candidate.longitude,
            distance_miles=item.candidate.distance_miles,
            terrain_type=item.candidate.terrain_type,
            best_window=TimeWindowSchema(start_utc=item.window.start, end_utc=item.window.end),
            light_phase=item.light.phase,
            score=item.result.score,
            conditions_summary=_conditions_summary(item.weather),
            advice=item.result.explanation,
            permit_required=item.candidate.permit_required,
            permit_notes=item.candidate.permit_notes,
            image_url=item.candidate.image_url,
            image_attribution=item.candidate.image_attribution,
        )
        for rank, item in enumerate(top, start=1)
    ]

    return RecommendationResponse(
        latitude=latitude,
        longitude=longitude,
        intent=intent,
        shot_type=resolved_shot_type,
        generated_at=now,
        recommendations=items,
    )
