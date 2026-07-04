"""Unit tests for server.services.golden_hour.

No network access is available while writing these tests, so accuracy is
verified two ways:
  1. Internal invariants that must hold regardless of any specific reference
     value (ordering, symmetry around solar noon, azimuth ranges). These are
     the primary correctness signal and have zero risk of being based on a
     misremembered fact.
  2. A small number of sanity checks against widely-known, broad daylight
     time ranges (e.g. "London sunrise in June is in the early-morning
     hours, not midday") using generous tolerances, since exact minute-level
     reference values cannot be independently verified offline here.
"""

from datetime import date, datetime, timedelta, timezone

import pytest

from server.services.golden_hour import (
    classify_window,
    compute_golden_hour,
    get_solar_position,
)
from server.services.scorer import LightPhase

LONDON = (51.4769, -0.0005)
SAN_FRANCISCO = (37.7749, -122.4194)
EQUATOR_PRIME_MERIDIAN = (0.0, 0.0)
SYDNEY = (-33.8688, 151.2093)
ARCTIC = (78.0, 15.0)  # Svalbard-ish, well inside the polar circle


def test_invalid_latitude_raises() -> None:
    with pytest.raises(ValueError):
        compute_golden_hour(91.0, 0.0, date(2026, 6, 21))


def test_invalid_longitude_raises() -> None:
    with pytest.raises(ValueError):
        compute_golden_hour(0.0, 200.0, date(2026, 6, 21))


def test_sunrise_before_noon_before_sunset() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    assert result.sunrise.time < result.solar_noon.time < result.sunset.time


def test_sunrise_sunset_symmetric_around_solar_noon() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    morning_gap = result.solar_noon.time - result.sunrise.time
    evening_gap = result.sunset.time - result.solar_noon.time
    assert abs((morning_gap - evening_gap).total_seconds()) < 1.0


def test_golden_and_blue_hour_ordering() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    assert result.blue_hour_morning is not None
    assert result.golden_hour_morning is not None
    assert result.golden_hour_evening is not None
    assert result.blue_hour_evening is not None

    assert result.blue_hour_morning.start < result.blue_hour_morning.end
    assert result.blue_hour_morning.end == result.golden_hour_morning.start
    assert result.golden_hour_morning.start < result.golden_hour_morning.end
    assert result.golden_hour_morning.end < result.solar_noon.time

    assert result.solar_noon.time < result.golden_hour_evening.start
    assert result.golden_hour_evening.start < result.golden_hour_evening.end
    assert result.golden_hour_evening.end == result.blue_hour_evening.start
    assert result.blue_hour_evening.start < result.blue_hour_evening.end


def test_day_length_roughly_twelve_hours_at_equinox_on_equator() -> None:
    # 2026-03-20 is close to the March equinox.
    result = compute_golden_hour(*EQUATOR_PRIME_MERIDIAN, date(2026, 3, 20))
    assert result.day_length_hours is not None
    assert abs(result.day_length_hours - 12.0) < 0.2


def test_sunrise_azimuth_roughly_east_at_equinox_on_equator() -> None:
    result = compute_golden_hour(*EQUATOR_PRIME_MERIDIAN, date(2026, 3, 20))
    assert abs(result.sunrise.azimuth_deg - 90.0) < 5.0
    assert abs(result.sunset.azimuth_deg - 270.0) < 5.0


def test_solar_noon_azimuth_faces_south_in_northern_midlatitudes() -> None:
    result = compute_golden_hour(*LONDON, date(2026, 7, 4))
    # From London (north of the Tropic of Cancer), the sun at solar noon
    # is very close to due south (azimuth 180) for most of the year.
    assert abs(result.solar_noon.azimuth_deg - 180.0) < 3.0


def test_solar_noon_azimuth_faces_north_in_southern_midlatitudes() -> None:
    result = compute_golden_hour(*SYDNEY, date(2026, 7, 4))
    # Sydney is south of the Tropic of Capricorn: sun at solar noon faces
    # (roughly) north.
    assert abs(result.solar_noon.azimuth_deg - 0.0) < 3.0 or abs(
        result.solar_noon.azimuth_deg - 360.0
    ) < 3.0


def test_london_june_sunrise_and_sunset_broad_sanity_range() -> None:
    result = compute_golden_hour(*LONDON, date(2026, 6, 21))
    sunrise_hour_utc = result.sunrise.time.hour + result.sunrise.time.minute / 60.0
    sunset_hour_utc = result.sunset.time.hour + result.sunset.time.minute / 60.0
    # Known broadly: London midsummer sunrise is pre-dawn UTC, sunset is
    # late evening UTC. Generous bounds since exact minutes aren't
    # independently verifiable offline.
    assert 3.0 <= sunrise_hour_utc <= 5.0
    assert 19.0 <= sunset_hour_utc <= 21.5


def test_polar_day_near_arctic_circle_in_summer() -> None:
    result = compute_golden_hour(*ARCTIC, date(2026, 6, 21))
    assert result.polar_day is True
    assert result.polar_night is False
    assert result.golden_hour_morning is None or result.blue_hour_morning is None


def test_polar_night_near_arctic_circle_in_winter() -> None:
    result = compute_golden_hour(*ARCTIC, date(2026, 12, 21))
    assert result.polar_night is True
    assert result.polar_day is False


def test_get_solar_position_altitude_bounds() -> None:
    at = datetime(2026, 7, 4, 12, 0, tzinfo=timezone.utc)
    pos = get_solar_position(*SAN_FRANCISCO, at)
    assert -90.0 <= pos.altitude_deg <= 90.0
    assert 0.0 <= pos.azimuth_deg < 360.0


def test_get_solar_position_rejects_invalid_coords() -> None:
    with pytest.raises(ValueError):
        get_solar_position(100.0, 0.0, datetime.now(timezone.utc))


def test_classify_window_identifies_golden_hour() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    window = result.golden_hour_evening
    assert window is not None
    light = classify_window(result, window.start, window.end)
    assert light.phase == LightPhase.GOLDEN_HOUR
    assert light.centrality > 0.9


def test_classify_window_identifies_blue_hour() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    window = result.blue_hour_morning
    assert window is not None
    light = classify_window(result, window.start, window.end)
    assert light.phase == LightPhase.BLUE_HOUR


def test_classify_window_identifies_midday_daylight() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    noon = result.solar_noon.time
    light = classify_window(result, noon - timedelta(minutes=15), noon + timedelta(minutes=15))
    assert light.phase == LightPhase.DAYLIGHT


def test_classify_window_identifies_night() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    assert result.blue_hour_evening is not None
    deep_night = result.blue_hour_evening.end + timedelta(hours=2)
    light = classify_window(result, deep_night, deep_night + timedelta(minutes=30))
    assert light.phase == LightPhase.NIGHT


def test_classify_window_edge_scores_lower_centrality_than_center() -> None:
    result = compute_golden_hour(*SAN_FRANCISCO, date(2026, 7, 4))
    window = result.golden_hour_evening
    assert window is not None
    center = window.start + (window.end - window.start) / 2
    at_center = classify_window(result, center - timedelta(minutes=1), center + timedelta(minutes=1))
    at_edge = classify_window(result, window.start, window.start + timedelta(minutes=2))
    assert at_center.centrality > at_edge.centrality
