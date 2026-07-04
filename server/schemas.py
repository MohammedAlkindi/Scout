"""Shared Pydantic request/response schemas for the MCP layer and HTTP layer.

Both server/mcp_server.py and server/api.py import from here so an MCP
client and a web client see identical typed shapes. Enums are re-exported
from server.services.scorer rather than duplicated.
"""

from __future__ import annotations

from datetime import date as date_type, datetime
from typing import Optional

from pydantic import BaseModel, Field

from server.services.scorer import CrowdLevel, LightPhase, ShotType


class SolarEventSchema(BaseModel):
    time_utc: datetime = Field(description="Instant in UTC.")
    azimuth_deg: float = Field(description="Compass bearing of the sun: 0=N, 90=E, 180=S, 270=W.")


class TimeWindowSchema(BaseModel):
    start_utc: datetime
    end_utc: datetime


class GoldenHourResponse(BaseModel):
    latitude: float
    longitude: float
    date: date_type
    sunrise: SolarEventSchema
    sunset: SolarEventSchema
    solar_noon: SolarEventSchema
    golden_hour_morning: Optional[TimeWindowSchema] = Field(
        default=None, description="Null if the sun never crosses this boundary on this date (polar day/night)."
    )
    golden_hour_evening: Optional[TimeWindowSchema] = None
    blue_hour_morning: Optional[TimeWindowSchema] = None
    blue_hour_evening: Optional[TimeWindowSchema] = None
    day_length_hours: Optional[float] = None
    polar_day: bool
    polar_night: bool


class WeatherSnapshotSchema(BaseModel):
    cloud_cover_pct: float
    wind_speed_mph: float
    visibility_miles: float
    precipitation_probability_pct: float
    temperature_f: float


class ForecastHourSchema(WeatherSnapshotSchema):
    time_utc: datetime


class ConditionsResponse(BaseModel):
    latitude: float
    longitude: float
    current: WeatherSnapshotSchema
    forecast_24h: list[ForecastHourSchema]


class LocationCandidateSchema(BaseModel):
    name: str
    latitude: float
    longitude: float
    distance_miles: float
    terrain_type: str
    accessibility_notes: str
    permit_required: bool
    permit_notes: Optional[str] = None
    crowd_level: CrowdLevel


class LocationsResponse(BaseModel):
    latitude: float
    longitude: float
    radius_miles: float
    intent: str
    candidates: list[LocationCandidateSchema]


class ScoreBreakdownSchema(BaseModel):
    light: float
    weather: float
    crowd: float
    access: float


class ScoreWindowResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    explanation: str
    light_phase: LightPhase
    breakdown: ScoreBreakdownSchema


class RecommendationItem(BaseModel):
    rank: int
    location_name: str
    latitude: float
    longitude: float
    distance_miles: float
    terrain_type: str
    best_window: TimeWindowSchema
    light_phase: LightPhase
    score: int = Field(ge=0, le=100)
    conditions_summary: str
    advice: str
    permit_required: bool
    permit_notes: Optional[str] = None


class RecommendationResponse(BaseModel):
    latitude: float
    longitude: float
    intent: str
    shot_type: ShotType
    generated_at: datetime
    recommendations: list[RecommendationItem]
