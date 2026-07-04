"""Unit tests for server.services.scorer."""

import pytest

from server.services.scorer import (
    CrowdLevel,
    LightPhase,
    LocationConditions,
    ShotType,
    WeatherSnapshot,
    WindowLightContext,
    score_window,
)


def make_location(
    name: str = "Test Overlook",
    crowd_level: CrowdLevel = CrowdLevel.LOW,
    permit_required: bool = False,
    accessibility_difficulty: float = 0.1,
) -> LocationConditions:
    return LocationConditions(
        name=name,
        crowd_level=crowd_level,
        permit_required=permit_required,
        accessibility_difficulty=accessibility_difficulty,
    )


def make_weather(
    cloud_cover_pct: float = 30.0,
    wind_speed_mph: float = 5.0,
    visibility_miles: float = 10.0,
    precipitation_probability_pct: float = 5.0,
    temperature_f: float = 65.0,
) -> WeatherSnapshot:
    return WeatherSnapshot(
        cloud_cover_pct=cloud_cover_pct,
        wind_speed_mph=wind_speed_mph,
        visibility_miles=visibility_miles,
        precipitation_probability_pct=precipitation_probability_pct,
        temperature_f=temperature_f,
    )


def test_score_within_bounds() -> None:
    result = score_window(
        make_location(),
        WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0),
        make_weather(),
        ShotType.LANDSCAPE,
    )
    assert 0 <= result.score <= 100


def test_golden_hour_scores_higher_than_midday_daylight() -> None:
    location = make_location()
    weather = make_weather()

    golden = score_window(
        location, WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0), weather, ShotType.LANDSCAPE
    )
    midday = score_window(
        location, WindowLightContext(phase=LightPhase.DAYLIGHT, centrality=1.0), weather, ShotType.LANDSCAPE
    )
    assert golden.score > midday.score


def test_golden_hour_scores_higher_than_night() -> None:
    location = make_location()
    weather = make_weather()

    golden = score_window(
        location, WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0), weather, ShotType.LANDSCAPE
    )
    night = score_window(
        location, WindowLightContext(phase=LightPhase.NIGHT, centrality=1.0), weather, ShotType.LANDSCAPE
    )
    assert golden.score > night.score


def test_phase_centrality_affects_score_monotonically() -> None:
    location = make_location()
    weather = make_weather()

    center = score_window(
        location, WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0), weather, ShotType.LANDSCAPE
    )
    edge = score_window(
        location, WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=0.0), weather, ShotType.LANDSCAPE
    )
    assert center.score >= edge.score


def test_high_wind_reduces_score() -> None:
    location = make_location()
    light = WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0)

    calm = score_window(location, light, make_weather(wind_speed_mph=3.0), ShotType.LANDSCAPE)
    windy = score_window(location, light, make_weather(wind_speed_mph=35.0), ShotType.LANDSCAPE)
    assert calm.score > windy.score


def test_high_precipitation_probability_reduces_score() -> None:
    location = make_location()
    light = WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0)

    dry = score_window(location, light, make_weather(precipitation_probability_pct=0.0), ShotType.LANDSCAPE)
    rainy = score_window(location, light, make_weather(precipitation_probability_pct=90.0), ShotType.LANDSCAPE)
    assert dry.score > rainy.score


def test_high_crowd_level_reduces_score() -> None:
    weather = make_weather()
    light = WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0)

    quiet = score_window(make_location(crowd_level=CrowdLevel.LOW), light, weather, ShotType.LANDSCAPE)
    packed = score_window(make_location(crowd_level=CrowdLevel.HIGH), light, weather, ShotType.LANDSCAPE)
    assert quiet.score > packed.score


def test_permit_requirement_reduces_score() -> None:
    weather = make_weather()
    light = WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0)

    no_permit = score_window(make_location(permit_required=False), light, weather, ShotType.LANDSCAPE)
    permit = score_window(make_location(permit_required=True), light, weather, ShotType.LANDSCAPE)
    assert no_permit.score > permit.score


def test_accessibility_difficulty_reduces_score() -> None:
    weather = make_weather()
    light = WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0)

    easy = score_window(make_location(accessibility_difficulty=0.0), light, weather, ShotType.LANDSCAPE)
    hard = score_window(make_location(accessibility_difficulty=1.0), light, weather, ShotType.LANDSCAPE)
    assert easy.score > hard.score


def test_astro_shot_type_prefers_clear_skies_over_landscape_band() -> None:
    location = make_location()
    light = WindowLightContext(phase=LightPhase.NIGHT, centrality=1.0)
    clear_weather = make_weather(cloud_cover_pct=2.0)

    astro = score_window(location, light, clear_weather, ShotType.ASTRO)
    landscape = score_window(location, light, clear_weather, ShotType.LANDSCAPE)
    assert astro.breakdown.weather >= landscape.breakdown.weather


def test_portrait_shot_type_prefers_overcast_over_clear() -> None:
    location = make_location()
    light = WindowLightContext(phase=LightPhase.DAYLIGHT, centrality=1.0)

    overcast = score_window(location, light, make_weather(cloud_cover_pct=70.0), ShotType.PORTRAIT)
    clear = score_window(location, light, make_weather(cloud_cover_pct=2.0), ShotType.PORTRAIT)
    assert overcast.breakdown.weather > clear.breakdown.weather


def test_explanation_mentions_location_name() -> None:
    location = make_location(name="Marshall's Beach")
    result = score_window(
        location, WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0), make_weather(), ShotType.LANDSCAPE
    )
    assert "Marshall's Beach" in result.explanation


def test_score_is_deterministic() -> None:
    location = make_location()
    light = WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=0.7)
    weather = make_weather()

    first = score_window(location, light, weather, ShotType.LANDSCAPE)
    second = score_window(location, light, weather, ShotType.LANDSCAPE)
    assert first == second


def test_breakdown_components_within_bounds() -> None:
    result = score_window(
        make_location(),
        WindowLightContext(phase=LightPhase.GOLDEN_HOUR, centrality=1.0),
        make_weather(),
        ShotType.LANDSCAPE,
    )
    assert 0 <= result.breakdown.light <= 100
    assert 0 <= result.breakdown.weather <= 100
    assert 0 <= result.breakdown.crowd <= 100
    assert 0 <= result.breakdown.access <= 100
