"""Solar position and golden/blue hour calculations.

Pure, deterministic, network-free math. No external services, no I/O.

Algorithm: the well-known "suncalc" formulation (a compact derivation of the
NOAA solar position equations, accurate to within roughly a minute for
sunrise/sunset at non-extreme latitudes). We reimplement it directly in
Python rather than depending on a third-party astronomy package so this
module has zero runtime dependencies and is trivially unit testable.

ASSUMPTION (documented per spec): all returned timestamps are UTC. This
module has no timezone database available (no `timezonefinder`/`pytz`
dependency), so it cannot derive the local IANA timezone from lat/lng alone.
The frontend, which already has the user's local clock via the browser,
converts these UTC instants to local time for display.

ASSUMPTION: azimuth is returned as a standard compass bearing in degrees,
0-360, measured clockwise from true North (0=N, 90=E, 180=S, 270=W). The
underlying suncalc formulas naturally produce azimuth measured from South;
we rotate by 180 degrees for the more common photography/navigation
convention.

Golden/blue hour boundaries follow the widely used suncalc convention:
  - sunrise / sunset:        solar elevation = -0.833 deg (accounts for
                              atmospheric refraction and the sun's radius)
  - golden hour boundary:    solar elevation = +6 deg
  - blue hour boundary:      solar elevation = -6 deg

  blue hour (morning)   = [dawn,        sunrise]        elevation -6 -> -0.833
  golden hour (morning) = [sunrise,     goldenHourEnd]   elevation -0.833 -> 6
  golden hour (evening) = [goldenHour,  sunset]          elevation 6 -> -0.833
  blue hour (evening)   = [sunset,      dusk]            elevation -0.833 -> -6
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from server.services.scorer import LightPhase, WindowLightContext

RAD = math.pi / 180.0
OBLIQUITY = RAD * 23.4397  # mean obliquity of the ecliptic
J1970 = 2440588
J2000 = 2451545
J0 = 0.0009

SUNRISE_SUNSET_ANGLE = -0.833
GOLDEN_HOUR_ANGLE = 6.0
BLUE_HOUR_ANGLE = -6.0


class PolarDayError(Exception):
    """Sun never crosses the requested elevation angle: it stays above it all day."""


class PolarNightError(Exception):
    """Sun never crosses the requested elevation angle: it stays below it all day."""


@dataclass(frozen=True)
class SolarPosition:
    altitude_deg: float
    azimuth_deg: float


@dataclass(frozen=True)
class SolarEvent:
    time: datetime
    azimuth_deg: float


@dataclass(frozen=True)
class TimeWindow:
    start: datetime
    end: datetime


@dataclass(frozen=True)
class GoldenHourResult:
    latitude: float
    longitude: float
    date: date
    sunrise: SolarEvent
    sunset: SolarEvent
    solar_noon: SolarEvent
    golden_hour_morning: Optional[TimeWindow]
    golden_hour_evening: Optional[TimeWindow]
    blue_hour_morning: Optional[TimeWindow]
    blue_hour_evening: Optional[TimeWindow]
    day_length_hours: Optional[float]
    polar_day: bool
    polar_night: bool


def _validate_coords(lat: float, lng: float) -> None:
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"latitude out of range: {lat}")
    if not (-180.0 <= lng <= 180.0):
        raise ValueError(f"longitude out of range: {lng}")


def _to_days(dt_utc: datetime) -> float:
    julian = dt_utc.timestamp() / 86400.0 - 0.5 + J1970
    return julian - J2000


def _from_julian(j: float) -> datetime:
    timestamp = (j + 0.5 - J1970) * 86400.0
    return datetime.fromtimestamp(timestamp, tz=timezone.utc)


def _solar_mean_anomaly(d: float) -> float:
    return RAD * (357.5291 + 0.98560028 * d)


def _equation_of_center(m: float) -> float:
    return RAD * (1.9148 * math.sin(m) + 0.02 * math.sin(2 * m) + 0.0003 * math.sin(3 * m))


def _ecliptic_longitude(m: float) -> float:
    c = _equation_of_center(m)
    perihelion = RAD * 102.9372
    return m + c + perihelion + math.pi


def _declination(ecliptic_longitude: float) -> float:
    return math.asin(math.sin(OBLIQUITY) * math.sin(ecliptic_longitude))


def _right_ascension(ecliptic_longitude: float) -> float:
    return math.atan2(
        math.sin(ecliptic_longitude) * math.cos(OBLIQUITY), math.cos(ecliptic_longitude)
    )


def _sidereal_time(d: float, lw: float) -> float:
    return RAD * (280.16 + 360.9856235 * d) - lw


def _julian_cycle(d: float, lw: float) -> float:
    return round(d - J0 - lw / (2 * math.pi))


def _approx_transit(ht: float, lw: float, n: float) -> float:
    return J0 + (ht + lw) / (2 * math.pi) + n


def _solar_transit_j(ds: float, m: float, ecliptic_longitude: float) -> float:
    return J2000 + ds + 0.0053 * math.sin(m) - 0.0069 * math.sin(2 * ecliptic_longitude)


def _hour_angle(elevation_angle_rad: float, phi: float, dec: float) -> float:
    """Solve for the hour angle at which the sun reaches a given elevation.

    Raises PolarDayError / PolarNightError when the sun never crosses that
    elevation on this day at this latitude (e.g. near the poles).
    """
    cos_h = (math.sin(elevation_angle_rad) - math.sin(phi) * math.sin(dec)) / (
        math.cos(phi) * math.cos(dec)
    )
    if cos_h > 1:
        raise PolarNightError("sun never reaches this elevation today (stays below it)")
    if cos_h < -1:
        raise PolarDayError("sun never crosses this elevation today (stays above it)")
    return math.acos(cos_h)


def _get_set_j(elevation_angle_rad: float, lw: float, phi: float, dec: float, n: float, m: float, l: float) -> float:
    w = _hour_angle(elevation_angle_rad, phi, dec)
    a = _approx_transit(w, lw, n)
    return _solar_transit_j(a, m, l)


def _sun_coords(d: float) -> tuple[float, float]:
    """Returns (declination, right_ascension) in radians for a given day offset."""
    m = _solar_mean_anomaly(d)
    l = _ecliptic_longitude(m)
    return _declination(l), _right_ascension(l)


def get_solar_position(lat: float, lng: float, at: datetime) -> SolarPosition:
    """Solar altitude and compass-bearing azimuth at an arbitrary instant."""
    _validate_coords(lat, lng)
    at_utc = at.astimezone(timezone.utc) if at.tzinfo else at.replace(tzinfo=timezone.utc)

    lw = RAD * -lng
    phi = RAD * lat
    d = _to_days(at_utc)
    dec, ra = _sun_coords(d)
    h = _sidereal_time(d, lw) - ra

    altitude = math.asin(math.sin(phi) * math.sin(dec) + math.cos(phi) * math.cos(dec) * math.cos(h))
    azimuth_from_south = math.atan2(math.sin(h), math.cos(h) * math.sin(phi) - math.tan(dec) * math.cos(phi))
    azimuth_from_north = (math.degrees(azimuth_from_south) + 180.0) % 360.0

    return SolarPosition(altitude_deg=math.degrees(altitude), azimuth_deg=azimuth_from_north)


def _rise_set(
    elevation_angle_deg: float, lw: float, phi: float, dec: float, n: float, m: float, l: float, j_noon: float
) -> tuple[Optional[float], Optional[float]]:
    try:
        j_set = _get_set_j(RAD * elevation_angle_deg, lw, phi, dec, n, m, l)
    except (PolarDayError, PolarNightError):
        return None, None
    j_rise = j_noon - (j_set - j_noon)
    return j_rise, j_set


def compute_golden_hour(lat: float, lng: float, on_date: date) -> GoldenHourResult:
    """Compute sunrise/sunset/golden hour/blue hour windows for a location and date."""
    _validate_coords(lat, lng)

    noon_utc = datetime(on_date.year, on_date.month, on_date.day, 12, 0, 0, tzinfo=timezone.utc)

    lw = RAD * -lng
    phi = RAD * lat
    d = _to_days(noon_utc)
    n = _julian_cycle(d, lw)
    ds = _approx_transit(0.0, lw, n)
    m = _solar_mean_anomaly(ds)
    l = _ecliptic_longitude(m)
    dec = _declination(l)
    j_noon = _solar_transit_j(ds, m, l)

    def azimuth_at(j: Optional[float]) -> float:
        if j is None:
            return 0.0
        return get_solar_position(lat, lng, _from_julian(j)).azimuth_deg

    def event(j: Optional[float]) -> Optional[SolarEvent]:
        if j is None:
            return None
        t = _from_julian(j)
        return SolarEvent(time=t, azimuth_deg=azimuth_at(j))

    j_sunrise, j_sunset = _rise_set(SUNRISE_SUNSET_ANGLE, lw, phi, dec, n, m, l, j_noon)
    j_golden_end_morning, j_golden_start_evening = _rise_set(GOLDEN_HOUR_ANGLE, lw, phi, dec, n, m, l, j_noon)
    j_dawn, j_dusk = _rise_set(BLUE_HOUR_ANGLE, lw, phi, dec, n, m, l, j_noon)

    solar_noon = SolarEvent(time=_from_julian(j_noon), azimuth_deg=azimuth_at(j_noon))
    sunrise = event(j_sunrise)
    sunset = event(j_sunset)

    polar_day = j_sunrise is None and j_sunset is None
    polar_night = polar_day  # both angle-crossing failures collapse to "no sunrise/sunset today"; disambiguated below

    # Disambiguate polar day (sun never sets, always above threshold) from
    # polar night (sun never rises, always below threshold) using the sun's
    # altitude at local solar noon.
    if polar_day:
        noon_altitude = get_solar_position(lat, lng, _from_julian(j_noon)).altitude_deg
        polar_night = noon_altitude < SUNRISE_SUNSET_ANGLE
        polar_day = not polar_night

    def window(j_start: Optional[float], j_end: Optional[float]) -> Optional[TimeWindow]:
        if j_start is None or j_end is None:
            return None
        return TimeWindow(start=_from_julian(j_start), end=_from_julian(j_end))

    day_length_hours: Optional[float]
    if sunrise is not None and sunset is not None:
        day_length_hours = (sunset.time - sunrise.time).total_seconds() / 3600.0
    else:
        day_length_hours = 24.0 if polar_day else 0.0

    return GoldenHourResult(
        latitude=lat,
        longitude=lng,
        date=on_date,
        sunrise=sunrise if sunrise is not None else SolarEvent(time=noon_utc, azimuth_deg=0.0),
        sunset=sunset if sunset is not None else SolarEvent(time=noon_utc, azimuth_deg=0.0),
        solar_noon=solar_noon,
        golden_hour_morning=window(j_sunrise, j_golden_end_morning),
        golden_hour_evening=window(j_golden_start_evening, j_sunset),
        blue_hour_morning=window(j_dawn, j_sunrise),
        blue_hour_evening=window(j_sunset, j_dusk),
        day_length_hours=day_length_hours,
        polar_day=polar_day,
        polar_night=polar_night,
    )


def _centrality(midpoint: datetime, window: TimeWindow) -> float:
    duration = (window.end - window.start).total_seconds()
    if duration <= 0:
        return 1.0
    center = window.start + (window.end - window.start) / 2
    offset = abs((midpoint - center).total_seconds())
    return max(0.0, 1.0 - offset / (duration / 2))


def classify_window(golden: GoldenHourResult, window_start: datetime, window_end: datetime) -> WindowLightContext:
    """Classify a candidate shoot window against a day's golden/blue hour boundaries.

    Uses the window's midpoint to pick a single dominant light phase, which
    is a deliberate simplification: a window straddling two phases (e.g.
    spanning both blue hour and golden hour) is scored as whichever phase
    contains its center, rather than as a blend of both.
    """
    midpoint = window_start + (window_end - window_start) / 2

    named_windows: list[tuple[LightPhase, Optional[TimeWindow]]] = [
        (LightPhase.BLUE_HOUR, golden.blue_hour_morning),
        (LightPhase.GOLDEN_HOUR, golden.golden_hour_morning),
        (LightPhase.GOLDEN_HOUR, golden.golden_hour_evening),
        (LightPhase.BLUE_HOUR, golden.blue_hour_evening),
    ]
    for phase, window in named_windows:
        if window is not None and window.start <= midpoint <= window.end:
            return WindowLightContext(phase=phase, centrality=_centrality(midpoint, window))

    if golden.polar_night:
        return WindowLightContext(phase=LightPhase.NIGHT, centrality=1.0)
    if golden.polar_day:
        return WindowLightContext(phase=LightPhase.DAYLIGHT, centrality=1.0)

    if (
        golden.golden_hour_morning is not None
        and golden.golden_hour_evening is not None
        and golden.golden_hour_morning.end <= midpoint <= golden.golden_hour_evening.start
    ):
        return WindowLightContext(phase=LightPhase.DAYLIGHT, centrality=1.0)

    return WindowLightContext(phase=LightPhase.NIGHT, centrality=1.0)
