"""Deterministic scoring of a location + time window against live conditions.

Pure, network-free logic: every input is plain data already fetched by the
caller (weather service, golden-hour service, location service). This keeps
the scoring rules fully unit testable without mocking HTTP calls.

The score is a weighted blend of four components:
  - light quality   (35%): how well the window aligns with golden/blue hour,
                            and whether cloud cover suits the light that
                            window naturally produces
  - weather comfort  (30%): wind, visibility, precipitation risk
  - crowd            (20%): lower expected crowding scores higher
  - access friction   (15%): permit requirements and difficult accessibility
                            reduce the score

Weights are module-level constants so the rationale is visible at a glance
and adjustable without touching the scoring algorithm itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ShotType(str, Enum):
    LANDSCAPE = "landscape"
    PORTRAIT = "portrait"
    ASTRO = "astro"
    WILDLIFE = "wildlife"
    URBAN = "urban"
    HIKING = "hiking"


class LightPhase(str, Enum):
    GOLDEN_HOUR = "golden_hour"
    BLUE_HOUR = "blue_hour"
    DAYLIGHT = "daylight"
    NIGHT = "night"


class CrowdLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


LIGHT_WEIGHT = 0.35
WEATHER_WEIGHT = 0.30
CROWD_WEIGHT = 0.20
ACCESS_WEIGHT = 0.15

CROWD_SCORE = {
    CrowdLevel.LOW: 100.0,
    CrowdLevel.MEDIUM: 60.0,
    CrowdLevel.HIGH: 25.0,
}

# Preferred cloud-cover band (percent) per shot type: (ideal_low, ideal_high).
# Landscape/urban golden-hour shots benefit from some cloud (drama, color);
# astro needs a clear sky; portraits benefit from diffused overcast light.
PREFERRED_CLOUD_COVER_PCT = {
    ShotType.LANDSCAPE: (10, 50),
    ShotType.PORTRAIT: (40, 90),
    ShotType.ASTRO: (0, 10),
    ShotType.WILDLIFE: (0, 60),
    ShotType.URBAN: (0, 70),
    ShotType.HIKING: (0, 60),
}


@dataclass(frozen=True)
class WeatherSnapshot:
    cloud_cover_pct: float
    wind_speed_mph: float
    visibility_miles: float
    precipitation_probability_pct: float
    temperature_f: float


@dataclass(frozen=True)
class LocationConditions:
    name: str
    crowd_level: CrowdLevel
    permit_required: bool
    accessibility_difficulty: float  # 0 (easy, paved/short) .. 1 (very hard)


@dataclass(frozen=True)
class WindowLightContext:
    phase: LightPhase
    # 0 at the exact start/end boundary of the phase, 1 at its temporal center.
    # Used as a tie-breaker so the very middle of golden hour outscores its edges.
    centrality: float = 1.0


@dataclass(frozen=True)
class ScoreBreakdown:
    light: float
    weather: float
    crowd: float
    access: float


@dataclass(frozen=True)
class ScoreResult:
    score: int
    explanation: str
    breakdown: ScoreBreakdown


def _light_score(light: WindowLightContext) -> float:
    base = {
        LightPhase.GOLDEN_HOUR: 100.0,
        LightPhase.BLUE_HOUR: 80.0,
        LightPhase.DAYLIGHT: 45.0,
        LightPhase.NIGHT: 20.0,
    }[light.phase]
    centrality = max(0.0, min(1.0, light.centrality))
    # Edges of a phase are worth 85% of its center value, not a cliff to 0.
    return base * (0.85 + 0.15 * centrality)


def _cloud_cover_score(cloud_cover_pct: float, shot_type: ShotType) -> float:
    low, high = PREFERRED_CLOUD_COVER_PCT[shot_type]
    if low <= cloud_cover_pct <= high:
        return 100.0
    distance = low - cloud_cover_pct if cloud_cover_pct < low else cloud_cover_pct - high
    # Linear falloff: fully off the preferred band by 50 points away.
    return max(0.0, 100.0 - (distance / 50.0) * 100.0)


def _weather_score(weather: WeatherSnapshot, shot_type: ShotType) -> float:
    cloud = _cloud_cover_score(weather.cloud_cover_pct, shot_type)

    if weather.wind_speed_mph <= 10:
        wind = 100.0
    elif weather.wind_speed_mph <= 20:
        wind = 100.0 - (weather.wind_speed_mph - 10) * 4.0
    else:
        wind = max(0.0, 60.0 - (weather.wind_speed_mph - 20) * 3.0)

    visibility = max(0.0, min(100.0, (weather.visibility_miles / 10.0) * 100.0))

    precip = max(0.0, 100.0 - weather.precipitation_probability_pct)

    return cloud * 0.4 + wind * 0.2 + visibility * 0.15 + precip * 0.25


def _access_score(location: LocationConditions) -> float:
    permit_penalty = 20.0 if location.permit_required else 0.0
    difficulty = max(0.0, min(1.0, location.accessibility_difficulty))
    difficulty_penalty = difficulty * 40.0
    return max(0.0, 100.0 - permit_penalty - difficulty_penalty)


def _explain(
    light: WindowLightContext,
    weather: WeatherSnapshot,
    location: LocationConditions,
    shot_type: ShotType,
    breakdown: ScoreBreakdown,
) -> str:
    parts: list[str] = []

    if light.phase == LightPhase.GOLDEN_HOUR:
        parts.append("falls within golden hour")
    elif light.phase == LightPhase.BLUE_HOUR:
        parts.append("falls within blue hour")
    elif light.phase == LightPhase.NIGHT:
        parts.append("is after dark")
    else:
        parts.append("is in flat midday light")

    low, high = PREFERRED_CLOUD_COVER_PCT[shot_type]
    if low <= weather.cloud_cover_pct <= high:
        parts.append(f"cloud cover ({weather.cloud_cover_pct:.0f}%) suits {shot_type.value}")
    elif weather.cloud_cover_pct < low:
        parts.append(f"skies are clearer ({weather.cloud_cover_pct:.0f}% cloud) than ideal for {shot_type.value}")
    else:
        parts.append(f"skies are cloudier ({weather.cloud_cover_pct:.0f}%) than ideal for {shot_type.value}")

    if weather.wind_speed_mph > 20:
        parts.append(f"wind is strong ({weather.wind_speed_mph:.0f} mph)")
    if weather.precipitation_probability_pct > 40:
        parts.append(f"{weather.precipitation_probability_pct:.0f}% chance of precipitation")

    if location.crowd_level != CrowdLevel.LOW:
        parts.append(f"{location.crowd_level.value} crowds expected")

    if location.permit_required:
        parts.append("a permit is required")

    return f"{location.name}: " + "; ".join(parts) + "."


def score_window(
    location: LocationConditions,
    light: WindowLightContext,
    weather: WeatherSnapshot,
    shot_type: ShotType = ShotType.LANDSCAPE,
) -> ScoreResult:
    """Score a location + time window from 0-100 with a plain-English explanation."""
    light_score = _light_score(light)
    weather_score = _weather_score(weather, shot_type)
    crowd_score = CROWD_SCORE[location.crowd_level]
    access_score = _access_score(location)

    total = (
        light_score * LIGHT_WEIGHT
        + weather_score * WEATHER_WEIGHT
        + crowd_score * CROWD_WEIGHT
        + access_score * ACCESS_WEIGHT
    )

    breakdown = ScoreBreakdown(
        light=round(light_score, 1),
        weather=round(weather_score, 1),
        crowd=round(crowd_score, 1),
        access=round(access_score, 1),
    )

    return ScoreResult(
        score=round(max(0.0, min(100.0, total))),
        explanation=_explain(light, weather, location, shot_type, breakdown),
        breakdown=breakdown,
    )
