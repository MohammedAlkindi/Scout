"""Scout MCP server: five tools for location-aware photography/outdoor planning.

This module only registers tools with FastMCP and translates ScoutError
into MCP tool errors -- all business logic (caching, external API calls,
scoring) lives in server/orchestration.py and server/services/*. Typed
inputs/outputs come from the shared Pydantic models in server/schemas.py,
so the JSON schema an MCP client sees here is exact.

Run directly for local development over stdio:
    python -m server.mcp_server
"""

from __future__ import annotations

from datetime import date as date_type, datetime
from typing import Optional

from mcp.server.fastmcp import FastMCP

from server import orchestration
from server.errors import ScoutError
from server.schemas import (
    ConditionsResponse,
    GoldenHourResponse,
    LocationsResponse,
    RecommendationResponse,
    ScoreWindowResponse,
)
from server.services.scorer import CrowdLevel, ShotType

mcp = FastMCP(
    "scout",
    instructions=(
        "Location-aware photography and outdoor activity planning. Combines sun "
        "position, live weather, and place data to recommend specific times and "
        "locations for a shot or activity, grounded in real conditions -- not a "
        "static top-10 list. Call build_recommendation for the common case of "
        "'what should I shoot near here, and when'; call the other tools "
        "individually for finer-grained control."
    ),
)


def _reraise_as_tool_error(exc: ScoutError) -> None:
    # FastMCP surfaces the exception's message as the tool error text, so
    # ScoutError subclasses (which carry only safe, user-facing messages)
    # can simply be re-raised as-is -- never a raw upstream exception.
    raise exc


@mcp.tool()
def get_golden_hour(latitude: float, longitude: float, date: date_type) -> GoldenHourResponse:
    """Sunrise, sunset, golden hour, blue hour, and solar noon for a location and date.

    Returns UTC timestamps and compass-bearing azimuths (0=N, 90=E, 180=S,
    270=W) at each event, so a photographer can plan which direction the sun
    will be in during each window. If the location is far enough poleward
    that the sun never crosses a given elevation on this date, that window
    is null and `polar_day`/`polar_night` explains why.
    """
    try:
        return orchestration.get_golden_hour(latitude, longitude, date)
    except ScoutError as exc:
        _reraise_as_tool_error(exc)
        raise  # unreachable, satisfies type checkers


@mcp.tool()
async def get_conditions(latitude: float, longitude: float) -> ConditionsResponse:
    """Current weather and a 24-hour hourly forecast for a location.

    Includes cloud cover, wind speed, visibility, and precipitation
    probability -- the inputs `score_window` uses to judge shooting
    conditions. Backed by a live weather provider with a short-TTL cache;
    raises a clear error if the upstream is unavailable rather than
    returning stale or partial data silently.
    """
    try:
        return await orchestration.get_conditions(latitude, longitude)
    except ScoutError as exc:
        _reraise_as_tool_error(exc)
        raise


@mcp.tool()
async def get_locations(
    latitude: float, longitude: float, radius_miles: float, intent: str, limit: int = 10
) -> LocationsResponse:
    """Candidate locations near (latitude, longitude) matching a shot or activity description.

    `intent` is free text such as "waterfall for long exposure", "sunset
    landscape viewpoint", or "morning trail run" -- it's matched against
    OpenStreetMap place tags to find relevant candidates. Each candidate
    includes distance, terrain type, accessibility notes, and best-effort
    permit requirements inferred from public map data (verify locally
    before relying on them).
    """
    try:
        return await orchestration.get_locations(latitude, longitude, radius_miles, intent, limit)
    except ScoutError as exc:
        _reraise_as_tool_error(exc)
        raise


@mcp.tool()
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

    Combines how the window aligns with golden/blue hour, live or forecast
    weather, expected crowding, and access friction (permits/difficulty)
    into one score and a human-readable reason. If the caller only has
    coordinates (rather than a candidate from `get_locations`), the crowd/
    permit/accessibility parameters default to moderate assumptions.
    """
    try:
        return await orchestration.score_window(
            latitude,
            longitude,
            window_start,
            window_end,
            location_name,
            shot_type,
            crowd_level,
            permit_required,
            accessibility_difficulty,
        )
    except ScoutError as exc:
        _reraise_as_tool_error(exc)
        raise


@mcp.tool()
async def build_recommendation(
    latitude: float, longitude: float, intent: str, radius_miles: float = 15.0, shot_type: Optional[ShotType] = None
) -> RecommendationResponse:
    """Top 3 location + time-window recommendations for a shot or activity, fully reasoned.

    Orchestrates the other four tools: finds candidate locations for
    `intent`, determines the next upcoming golden/blue hour windows, pulls
    live conditions, and scores every location against every window. Returns
    the best-scoring window for each of the top 3 locations, with a
    conditions summary and one-line advice per location. `shot_type` is
    inferred from `intent` if not given explicitly.
    """
    try:
        return await orchestration.build_recommendation(latitude, longitude, intent, radius_miles, shot_type)
    except ScoutError as exc:
        _reraise_as_tool_error(exc)
        raise


if __name__ == "__main__":
    mcp.run()
