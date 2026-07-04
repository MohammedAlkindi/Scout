"""Candidate location search via OpenStreetMap Overpass API.

ASSUMPTION: OpenStreetMap/Overpass was chosen (over a paid places API like
Google Places or Foursquare) because it is free, keyless, and its tag
vocabulary (natural=peak, tourism=viewpoint, leisure=nature_reserve, ...)
maps well onto photography/outdoor terrain types without a licensing
agreement. The tradeoff: coverage and tag completeness vary by region, and
"permit required" / "crowd level" are best-effort heuristics inferred from
whatever tags a given contributor happened to add -- never authoritative.
Every returned candidate should be read as "worth checking," not "verified."

Overpass rejects requests without a descriptive User-Agent header.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

import httpx

from server import config
from server.errors import NoCandidatesFoundError, UpstreamServiceError
from server.rate_limiter import TokenBucket
from server.services.scorer import CrowdLevel

_rate_limiter = TokenBucket(config.LOCATIONS_RATE_LIMIT_MAX_CALLS, config.LOCATIONS_RATE_LIMIT_PER_SECONDS)

_EARTH_RADIUS_MILES = 3958.8
_MAX_RAW_RESULTS = 40

# Free-text keyword -> OSM (key, value) tag pairs to search for. A
# description can match multiple keywords; matched tag sets are unioned.
_KEYWORD_TAGS: dict[str, list[tuple[str, str]]] = {
    "waterfall": [("natural", "waterfall")],
    "sunset": [("tourism", "viewpoint")],
    "sunrise": [("tourism", "viewpoint")],
    "landscape": [("tourism", "viewpoint"), ("natural", "peak")],
    "mountain": [("natural", "peak")],
    "peak": [("natural", "peak")],
    "summit": [("natural", "peak")],
    "hike": [("tourism", "viewpoint"), ("leisure", "nature_reserve")],
    "hiking": [("tourism", "viewpoint"), ("leisure", "nature_reserve")],
    "trail": [("leisure", "nature_reserve")],
    "beach": [("natural", "beach")],
    "coast": [("natural", "beach"), ("natural", "cliff")],
    "cliff": [("natural", "cliff")],
    "lake": [("natural", "water")],
    "water": [("natural", "water")],
    "forest": [("natural", "wood"), ("leisure", "nature_reserve")],
    "wildlife": [("leisure", "nature_reserve"), ("natural", "wood")],
    "bird": [("leisure", "nature_reserve")],
    "urban": [("tourism", "attraction")],
    "architecture": [("tourism", "attraction"), ("historic", "building")],
    "city": [("tourism", "attraction")],
    "street": [("tourism", "attraction")],
    "park": [("leisure", "park")],
    "portrait": [("leisure", "park"), ("tourism", "attraction")],
    "astro": [("natural", "peak"), ("tourism", "viewpoint")],
    "stars": [("natural", "peak"), ("tourism", "viewpoint")],
    "night": [("natural", "peak"), ("tourism", "viewpoint")],
}

_DEFAULT_TAGS: list[tuple[str, str]] = [
    ("tourism", "viewpoint"),
    ("natural", "peak"),
    ("natural", "water"),
    ("leisure", "park"),
]

_CATEGORY_BY_TAG: dict[tuple[str, str], str] = {
    ("natural", "peak"): "mountain summit",
    ("natural", "waterfall"): "waterfall",
    ("natural", "beach"): "beach",
    ("natural", "water"): "waterfront",
    ("natural", "wood"): "forest",
    ("natural", "cliff"): "coastal cliff",
    ("tourism", "viewpoint"): "scenic viewpoint",
    ("tourism", "attraction"): "landmark",
    ("leisure", "nature_reserve"): "nature reserve",
    ("leisure", "park"): "urban park",
    ("historic", "building"): "historic architecture",
}


@dataclass(frozen=True)
class LocationCandidate:
    name: str
    latitude: float
    longitude: float
    distance_miles: float
    terrain_type: str
    accessibility_notes: str
    accessibility_difficulty: float
    permit_required: bool
    permit_notes: Optional[str]
    crowd_level: CrowdLevel
    osm_id: int


def _tags_for_intent(intent: str) -> list[tuple[str, str]]:
    text = intent.lower()
    matched: list[tuple[str, str]] = []
    for keyword, tags in _KEYWORD_TAGS.items():
        if keyword in text:
            for tag in tags:
                if tag not in matched:
                    matched.append(tag)
    return matched or _DEFAULT_TAGS


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return _EARTH_RADIUS_MILES * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _build_overpass_query(lat: float, lng: float, radius_meters: float, tags: list[tuple[str, str]]) -> str:
    clauses = []
    for key, value in tags:
        clauses.append(f'node["{key}"="{value}"](around:{radius_meters},{lat},{lng});')
        clauses.append(f'way["{key}"="{value}"](around:{radius_meters},{lat},{lng});')
    body = "\n  ".join(clauses)
    return f"[out:json][timeout:20];\n(\n  {body}\n);\nout center {_MAX_RAW_RESULTS};"


def _element_coords(element: dict) -> Optional[tuple[float, float]]:
    if "lat" in element and "lon" in element:
        return element["lat"], element["lon"]
    center = element.get("center")
    if center:
        return center["lat"], center["lon"]
    return None


def _infer_terrain(tags: dict) -> str:
    for (key, value), label in _CATEGORY_BY_TAG.items():
        if tags.get(key) == value:
            return label
    return "point of interest"


def _accessibility_notes(tags: dict) -> str:
    notes: list[str] = []
    wheelchair = tags.get("wheelchair")
    if wheelchair == "yes":
        notes.append("wheelchair accessible")
    elif wheelchair == "limited":
        notes.append("limited wheelchair accessibility")
    elif wheelchair == "no":
        notes.append("not wheelchair accessible")

    surface = tags.get("surface")
    if surface:
        notes.append(f"surface: {surface}")

    if tags.get("access") == "private":
        notes.append("access may be private or restricted")

    return "; ".join(notes) if notes else "accessibility unknown -- verify locally"


def _accessibility_difficulty(tags: dict) -> float:
    """Heuristic 0 (easy) - 1 (very hard) difficulty estimate from OSM tags.

    Defaults to a moderate 0.3 when no relevant tag is present, since most
    OSM features simply don't carry accessibility metadata.
    """
    difficulty = 0.3
    wheelchair = tags.get("wheelchair")
    if wheelchair == "yes":
        difficulty = 0.05
    elif wheelchair == "limited":
        difficulty = 0.4
    elif wheelchair == "no":
        difficulty = 0.7

    if tags.get("surface") in ("unpaved", "gravel", "dirt", "ground", "sand"):
        difficulty = max(difficulty, 0.5)
    if tags.get("natural") in ("peak", "cliff"):
        difficulty = max(difficulty, 0.6)

    return min(1.0, difficulty)


def _permit_info(tags: dict) -> tuple[bool, Optional[str]]:
    access = tags.get("access")
    if access in ("permit", "private", "customers"):
        return True, f"OSM tags indicate restricted access ({access}); verify permit requirements before visiting"
    if tags.get("fee") == "yes":
        return True, "a fee is charged at this location per OSM data"
    if "protect_class" in tags or tags.get("boundary") == "protected_area":
        return True, "location is within a protected area; check local permit rules"
    return False, None


def _crowd_level(tags: dict) -> CrowdLevel:
    """Best-effort popularity heuristic from OSM notability tags.

    Not a real crowd-sourced signal (Overpass has no foot-traffic data) --
    used only as a reasonable default until a dedicated crowd-data source
    is integrated.
    """
    notable = any(key in tags for key in ("wikipedia", "wikidata", "wikimedia_commons"))
    if notable and tags.get("tourism") == "attraction":
        return CrowdLevel.HIGH
    if notable or tags.get("tourism") in ("viewpoint", "attraction"):
        return CrowdLevel.MEDIUM
    return CrowdLevel.LOW


async def find_locations(
    lat: float, lng: float, radius_miles: float, intent: str, limit: int = 10
) -> list[LocationCandidate]:
    """Find named candidate locations near (lat, lng) matching a shot/activity intent.

    Raises UpstreamServiceError on network failure and NoCandidatesFoundError
    when the search succeeds but nothing named matches within the radius.
    """
    await _rate_limiter.acquire()

    tags = _tags_for_intent(intent)
    radius_meters = radius_miles * 1609.344
    query = _build_overpass_query(lat, lng, radius_meters, tags)

    try:
        async with httpx.AsyncClient(timeout=config.HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                config.OVERPASS_BASE_URL,
                data={"data": query},
                headers={"User-Agent": config.HTTP_USER_AGENT},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise UpstreamServiceError("Location search is temporarily unavailable.") from exc

    candidates: list[LocationCandidate] = []
    for element in data.get("elements", []):
        coords = _element_coords(element)
        if coords is None:
            continue
        elat, elng = coords
        tags_dict = element.get("tags", {})
        name = tags_dict.get("name")
        if not name:
            continue  # unnamed features make poor recommendations
        permit_required, permit_notes = _permit_info(tags_dict)
        candidates.append(
            LocationCandidate(
                name=name,
                latitude=elat,
                longitude=elng,
                distance_miles=round(_haversine_miles(lat, lng, elat, elng), 2),
                terrain_type=_infer_terrain(tags_dict),
                accessibility_notes=_accessibility_notes(tags_dict),
                accessibility_difficulty=_accessibility_difficulty(tags_dict),
                permit_required=permit_required,
                permit_notes=permit_notes,
                crowd_level=_crowd_level(tags_dict),
                osm_id=element.get("id", 0),
            )
        )

    if not candidates:
        raise NoCandidatesFoundError("No named locations found matching this description in the given radius.")

    candidates.sort(key=lambda c: c.distance_miles)
    return candidates[:limit]
