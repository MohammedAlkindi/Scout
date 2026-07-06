"""Thin HTTP API layer wrapping the MCP tool orchestration for the web client.

Route handlers only parse/validate transport-level input (query params,
JSON bodies) and call into server/orchestration.py -- no scoring, caching,
or external-API logic lives here. Every error response is one of a small
set of structured JSON shapes; raw exceptions (httpx errors, JSON parsing
failures, unexpected bugs) are caught at the exception-handler level and
translated to a generic message so they never reach the client.
"""

from __future__ import annotations

import logging
import os
from time import perf_counter
from datetime import date as date_type, datetime
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from server import config, orchestration
from server.errors import InvalidRequestError, NoCandidatesFoundError, RateLimitedError, ScoutError, UpstreamServiceError
from server.rate_limiter import TokenBucket
from server.schemas import (
    ConditionsResponse,
    GoldenHourResponse,
    LocationsResponse,
    RecommendationResponse,
    ScoreWindowResponse,
)
from server.services.scorer import CrowdLevel, ShotType

logger = logging.getLogger("scout.api")

app = FastAPI(
    title="Scout API",
    description="Location-aware photography and outdoor activity recommendations, grounded in live conditions.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # no accounts, cookies, or auth: a public read-mostly recommendation API
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Per-client-IP inbound rate limiting, independent of the outbound limiters
# in server/services/weather.py and server/services/locations.py. Buckets
# are created lazily and kept for the process lifetime -- fine at this
# scale; a production deployment behind many distinct IPs long-term would
# want an eviction policy, which is out of scope here.
_client_buckets: dict[str, TokenBucket] = {}


def _bucket_for(client_ip: str) -> TokenBucket:
    bucket = _client_buckets.get(client_ip)
    if bucket is None:
        bucket = TokenBucket(config.API_CLIENT_RATE_LIMIT_MAX_CALLS, config.API_CLIENT_RATE_LIMIT_PER_SECONDS)
        _client_buckets[client_ip] = bucket
    return bucket


async def enforce_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    if not await _bucket_for(client_ip).try_acquire():
        raise RateLimitedError("Too many requests. Please slow down and try again shortly.")


_rate_limited = Depends(enforce_rate_limit)

_ERROR_STATUS: dict[type, int] = {
    InvalidRequestError: 400,
    NoCandidatesFoundError: 404,
    RateLimitedError: 429,
    UpstreamServiceError: 502,
}

_ERROR_META: dict[type, dict[str, object]] = {
    InvalidRequestError: {
        "code": "invalid_request",
        "retryable": False,
        "recovery_hint": "Check the coordinates, activity, and radius before trying again.",
    },
    NoCandidatesFoundError: {
        "code": "no_candidates",
        "retryable": True,
        "recovery_hint": "Try a wider radius or choose a different activity such as coastal sunset or quiet portrait.",
    },
    RateLimitedError: {
        "code": "rate_limited",
        "retryable": True,
        "recovery_hint": "Wait a minute, then retry. Scout protects the free map providers from repeated broad searches.",
    },
    UpstreamServiceError: {
        "code": "upstream_unavailable",
        "retryable": True,
        "recovery_hint": "Retry once. If it keeps failing, use the bundled Muscat demo scout for a guaranteed product walkthrough.",
    },
}


@app.exception_handler(ScoutError)
async def scout_error_handler(request: Request, exc: ScoutError) -> JSONResponse:
    status_code = _ERROR_STATUS.get(type(exc), 500)
    meta = _ERROR_META.get(
        type(exc),
        {
            "code": "scout_error",
            "retryable": True,
            "recovery_hint": "Try again. Scout did not expose raw provider errors to the client.",
        },
    )
    return JSONResponse(status_code=status_code, content={"error": exc.message, **meta})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error in %s", request.url.path)
    return JSONResponse(status_code=500, content={"error": "An unexpected error occurred. Please try again."})


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/golden-hour", response_model=GoldenHourResponse, dependencies=[_rate_limited])
async def golden_hour_route(lat: float, lng: float, date: date_type) -> GoldenHourResponse:
    return orchestration.get_golden_hour(lat, lng, date)


@app.get("/api/conditions", response_model=ConditionsResponse, dependencies=[_rate_limited])
async def conditions_route(lat: float, lng: float) -> ConditionsResponse:
    return await orchestration.get_conditions(lat, lng)


@app.get("/api/locations", response_model=LocationsResponse, dependencies=[_rate_limited])
async def locations_route(
    lat: float, lng: float, intent: str, radius_miles: float = 15.0, limit: int = 10
) -> LocationsResponse:
    return await orchestration.get_locations(lat, lng, radius_miles, intent, limit)


class ScoreWindowRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    window_start: datetime
    window_end: datetime
    location_name: str = "This location"
    shot_type: ShotType = ShotType.LANDSCAPE
    crowd_level: CrowdLevel = CrowdLevel.MEDIUM
    permit_required: bool = False
    accessibility_difficulty: float = Field(default=0.3, ge=0, le=1)


@app.post("/api/score-window", response_model=ScoreWindowResponse, dependencies=[_rate_limited])
async def score_window_route(body: ScoreWindowRequest) -> ScoreWindowResponse:
    return await orchestration.score_window(
        body.latitude,
        body.longitude,
        body.window_start,
        body.window_end,
        body.location_name,
        body.shot_type,
        body.crowd_level,
        body.permit_required,
        body.accessibility_difficulty,
    )


class RecommendationRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    intent: str = Field(min_length=1)
    radius_miles: float = Field(default=15.0, gt=0, le=100)
    shot_type: Optional[ShotType] = None


@app.post("/api/recommendation", response_model=RecommendationResponse, dependencies=[_rate_limited])
async def recommendation_route(body: RecommendationRequest) -> RecommendationResponse:
    started = perf_counter()
    response = await orchestration.build_recommendation(
        body.latitude, body.longitude, body.intent, body.radius_miles, body.shot_type
    )
    elapsed_ms = round((perf_counter() - started) * 1000)
    logger.info(
        "recommendation_complete lat=%.3f lng=%.3f shot_type=%s count=%s demo_mode=%s elapsed_ms=%s",
        body.latitude,
        body.longitude,
        response.shot_type,
        len(response.recommendations),
        response.demo_mode,
        elapsed_ms,
    )
    return response


_PUBLIC_DIR = Path(os.environ.get("SCOUT_PUBLIC_DIR", Path(__file__).resolve().parent.parent / "public"))

# Mounted last and at "/" so the /api/* routes above always take precedence.
if _PUBLIC_DIR.exists():
    app.mount("/", StaticFiles(directory=_PUBLIC_DIR, html=True), name="public")
