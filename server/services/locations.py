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

import logging
import math
from dataclasses import dataclass
from time import monotonic, perf_counter
from typing import Optional

import httpx

from server import config
from server.errors import NoCandidatesFoundError, RateLimitedError, UpstreamServiceError
from server.observability import record_upstream_call
from server.rate_limiter import TokenBucket
from server.services.scorer import CrowdLevel

logger = logging.getLogger("scout.locations")

_rate_limiter = TokenBucket(config.LOCATIONS_RATE_LIMIT_MAX_CALLS, config.LOCATIONS_RATE_LIMIT_PER_SECONDS)
_endpoint_cooldowns: dict[str, float] = {}

_EARTH_RADIUS_MILES = 3958.8
_MAX_RAW_RESULTS = 30
_MAX_TAGS_PER_QUERY = 2
_FIRST_PASS_RADIUS_MILES = 1.0
_SECOND_PASS_RADIUS_MILES = 3.0
_THIRD_PASS_RADIUS_MILES = 8.0

_LOCATION_RATE_LIMIT_MESSAGE = (
    "Location provider is rate-limited. Try a more specific intent or smaller search radius."
)
_LOCATION_UNAVAILABLE_MESSAGE = (
    "Location search is temporarily unavailable. Try a more specific intent or smaller search radius."
)

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
    "romantic": [("leisure", "park"), ("tourism", "viewpoint"), ("tourism", "attraction")],
    "couple": [("leisure", "park"), ("tourism", "viewpoint"), ("tourism", "attraction")],
    "engagement": [("leisure", "park"), ("tourism", "viewpoint"), ("tourism", "attraction")],
    "proposal": [("leisure", "park"), ("tourism", "viewpoint"), ("tourism", "attraction")],
    "wedding": [("leisure", "park"), ("tourism", "viewpoint"), ("tourism", "attraction")],
    "astro": [("natural", "peak"), ("tourism", "viewpoint")],
    "stars": [("natural", "peak"), ("tourism", "viewpoint")],
    "night": [("natural", "peak"), ("tourism", "viewpoint")],
    "photography": [("tourism", "viewpoint"), ("leisure", "park")],
    "photos": [("tourism", "viewpoint"), ("leisure", "park")],
    "photo": [("tourism", "viewpoint"), ("leisure", "park")],
    "shoot": [("tourism", "viewpoint"), ("leisure", "park")],
}

_DEFAULT_TAGS: list[tuple[str, str]] = [
    ("tourism", "viewpoint"),
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
    image_url: Optional[str]
    image_attribution: Optional[str]


def _tags_for_intent(intent: str) -> list[tuple[str, str]]:
    text = intent.lower()
    matched: list[tuple[str, str]] = []
    for keyword, tags in _KEYWORD_TAGS.items():
        if keyword in text:
            for tag in tags:
                if tag not in matched:
                    matched.append(tag)
    return (matched or _DEFAULT_TAGS)[:_MAX_TAGS_PER_QUERY]


def _haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return _EARTH_RADIUS_MILES * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _build_overpass_query(lat: float, lng: float, radius_meters: float, tags: list[tuple[str, str]]) -> str:
    clauses = []
    for key, value in tags:
        clauses.append(f'node["{key}"="{value}"]["name"](around:{radius_meters},{lat},{lng});')
        clauses.append(f'way["{key}"="{value}"]["name"](around:{radius_meters},{lat},{lng});')
    body = "\n  ".join(clauses)
    return f"[out:json][timeout:{config.OVERPASS_QUERY_TIMEOUT_SECONDS}];\n(\n  {body}\n);\nout center {_MAX_RAW_RESULTS};"


def _search_radii(radius_miles: float) -> list[float]:
    """Search nearby first, expanding only when no named candidates are found."""
    radii: list[float] = []
    for checkpoint in (_FIRST_PASS_RADIUS_MILES, _SECOND_PASS_RADIUS_MILES, _THIRD_PASS_RADIUS_MILES, radius_miles):
        radius = min(radius_miles, checkpoint)
        if radius <= 0:
            continue
        if not radii or abs(radii[-1] - radius) > 0.01:
            radii.append(radius)
    return radii


def _tag_groups(tags: list[tuple[str, str]]) -> list[list[tuple[str, str]]]:
    """Try focused single-tag queries instead of one expensive union query."""
    return [[tag] for tag in tags]


def _endpoint_is_cooling_down(endpoint: str) -> bool:
    return monotonic() < _endpoint_cooldowns.get(endpoint, 0.0)


def _start_endpoint_cooldown(endpoint: str) -> None:
    _endpoint_cooldowns[endpoint] = monotonic() + config.OVERPASS_RATE_LIMIT_COOLDOWN_SECONDS


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


_TERRAIN_BASE_DIFFICULTY: dict[str, float] = {
    "waterfall": 0.5,
    "nature reserve": 0.4,
    "forest": 0.4,
    "beach": 0.25,
    "scenic viewpoint": 0.25,
    "waterfront": 0.25,
    "urban park": 0.15,
    "landmark": 0.2,
    "historic architecture": 0.15,
}
# natural=peak/cliff is handled by the explicit override at the bottom of
# _accessibility_difficulty instead of this table, since it must win even
# over a low wheelchair-tagged baseline.
_DEFAULT_TERRAIN_DIFFICULTY = 0.3  # unrecognized tag combination ("point of interest")


def _accessibility_difficulty(tags: dict) -> float:
    """Heuristic 0 (easy) - 1 (very hard) difficulty estimate from OSM tags.

    Starts from a per-terrain baseline -- a waterfall or nature-reserve
    trail starts harder than a roadside viewpoint or urban park -- since
    most OSM features carry no explicit accessibility metadata at all.
    Wheelchair/surface tags, when present, then override or raise it.
    """
    difficulty = _TERRAIN_BASE_DIFFICULTY.get(_infer_terrain(tags), _DEFAULT_TERRAIN_DIFFICULTY)
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
    is integrated. A bare `tourism=viewpoint` tag is *not* treated as a
    popularity signal on its own: it's one of the tags Scout searches by
    default, so most candidates carry it -- counting it here would flatten
    nearly every result into the same MEDIUM bucket. Only an actual
    notability tag, or the more deliberate `tourism=attraction` tag, escalates
    a location above LOW.
    """
    notable = any(key in tags for key in ("wikipedia", "wikidata", "wikimedia_commons"))
    is_attraction = tags.get("tourism") == "attraction"
    if notable and is_attraction:
        return CrowdLevel.HIGH
    if notable or is_attraction:
        return CrowdLevel.MEDIUM
    return CrowdLevel.LOW


def _image_info(tags: dict) -> tuple[Optional[str], Optional[str]]:
    """Best-effort real image URL from OSM/Wikimedia tags.

    OSM commonly stores either a direct `image=https://...` value or a
    `wikimedia_commons=File:...` value. We deliberately avoid adding a
    photo API dependency here: when public map metadata has a real image,
    expose it; otherwise the frontend keeps its generated scouting preview.
    """
    image = tags.get("image")
    if isinstance(image, str) and image.startswith(("https://", "http://")):
        return image, "Image from OpenStreetMap metadata"

    commons = tags.get("wikimedia_commons")
    if isinstance(commons, str) and commons.startswith("File:"):
        filename = commons.removeprefix("File:").replace(" ", "_")
        return f"https://commons.wikimedia.org/wiki/Special:FilePath/{filename}", "Image from Wikimedia Commons"

    return None, None


async def _fetch_overpass_json(client: httpx.AsyncClient, endpoint: str, query: str) -> dict:
    started = perf_counter()
    try:
        response = await client.post(
            endpoint,
            data={"data": query},
            headers={"User-Agent": config.HTTP_USER_AGENT},
        )
        response.raise_for_status()
        data = response.json()
        record_upstream_call("overpass", "success", round((perf_counter() - started) * 1000), response.status_code)
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code
        if status_code == 429:
            _start_endpoint_cooldown(endpoint)
            record_upstream_call("overpass", "rate_limited", round((perf_counter() - started) * 1000), status_code)
            raise RateLimitedError(_LOCATION_RATE_LIMIT_MESSAGE) from exc
        record_upstream_call("overpass", "http_error", round((perf_counter() - started) * 1000), status_code)
        raise UpstreamServiceError(_LOCATION_UNAVAILABLE_MESSAGE) from exc
    except httpx.TimeoutException as exc:
        record_upstream_call("overpass", "timeout", round((perf_counter() - started) * 1000))
        raise UpstreamServiceError(_LOCATION_UNAVAILABLE_MESSAGE) from exc
    except (httpx.HTTPError, ValueError) as exc:
        record_upstream_call("overpass", "error", round((perf_counter() - started) * 1000))
        raise UpstreamServiceError(_LOCATION_UNAVAILABLE_MESSAGE) from exc

    if not isinstance(data, dict):
        raise UpstreamServiceError(_LOCATION_UNAVAILABLE_MESSAGE)
    remark = data.get("remark")
    if isinstance(remark, str) and "runtime error" in remark.lower():
        raise UpstreamServiceError(_LOCATION_UNAVAILABLE_MESSAGE)
    return data


def _candidate_from_element(origin_lat: float, origin_lng: float, element: dict) -> Optional[LocationCandidate]:
    coords = _element_coords(element)
    if coords is None:
        return None

    tags_dict = element.get("tags", {})
    if not isinstance(tags_dict, dict):
        return None

    name = tags_dict.get("name")
    if not name:
        return None

    elat, elng = coords
    permit_required, permit_notes = _permit_info(tags_dict)
    image_url, image_attribution = _image_info(tags_dict)
    return LocationCandidate(
        name=name,
        latitude=elat,
        longitude=elng,
        distance_miles=round(_haversine_miles(origin_lat, origin_lng, elat, elng), 2),
        terrain_type=_infer_terrain(tags_dict),
        accessibility_notes=_accessibility_notes(tags_dict),
        accessibility_difficulty=_accessibility_difficulty(tags_dict),
        permit_required=permit_required,
        permit_notes=permit_notes,
        crowd_level=_crowd_level(tags_dict),
        osm_id=element.get("id", 0),
        image_url=image_url,
        image_attribution=image_attribution,
    )


def _candidates_from_elements(origin_lat: float, origin_lng: float, elements: object) -> list[LocationCandidate]:
    if not isinstance(elements, list):
        return []

    candidates: list[LocationCandidate] = []
    for element in elements:
        if not isinstance(element, dict):
            continue
        candidate = _candidate_from_element(origin_lat, origin_lng, element)
        if candidate is not None:
            candidates.append(candidate)

    candidates.sort(key=lambda c: c.distance_miles)
    return candidates


async def find_locations(
    lat: float, lng: float, radius_miles: float, intent: str, limit: int = 10
) -> list[LocationCandidate]:
    """Find named candidate locations near (lat, lng) matching a shot/activity intent.

    Raises UpstreamServiceError on network failure and NoCandidatesFoundError
    when the search succeeds but nothing named matches within the radius.
    """
    await _rate_limiter.acquire()

    tags = _tags_for_intent(intent)

    last_upstream_error: Optional[UpstreamServiceError] = None
    last_rate_limit_error: Optional[RateLimitedError] = None
    successful_queries = 0

    attempt_count = 0
    exhausted_attempts = False

    async with httpx.AsyncClient(timeout=config.OVERPASS_HTTP_TIMEOUT_SECONDS) as client:
        for search_radius_miles in _search_radii(radius_miles):
            for tag_group in _tag_groups(tags):
                radius_meters = search_radius_miles * 1609.344
                query = _build_overpass_query(lat, lng, radius_meters, tag_group)
                for endpoint_index, endpoint in enumerate(config.OVERPASS_BASE_URLS):
                    if _endpoint_is_cooling_down(endpoint):
                        last_rate_limit_error = RateLimitedError(_LOCATION_RATE_LIMIT_MESSAGE)
                        continue

                    if attempt_count >= config.OVERPASS_MAX_ATTEMPTS:
                        exhausted_attempts = True
                        break

                    attempt_count += 1
                    try:
                        data = await _fetch_overpass_json(client, endpoint, query)
                    except RateLimitedError as exc:
                        last_rate_limit_error = exc
                        logger.warning(
                            "OSM candidate query rate-limited radius_miles=%.1f tag_count=%s endpoint_index=%s",
                            search_radius_miles,
                            len(tag_group),
                            endpoint_index,
                        )
                        continue
                    except UpstreamServiceError as exc:
                        last_upstream_error = exc
                        logger.warning(
                            "OSM candidate query failed radius_miles=%.1f tag_count=%s endpoint_index=%s",
                            search_radius_miles,
                            len(tag_group),
                            endpoint_index,
                        )
                        continue

                    successful_queries += 1
                    candidates = _candidates_from_elements(lat, lng, data.get("elements", []))
                    if candidates:
                        logger.info(
                            "Found %s OSM candidates radius_miles=%.1f tag_count=%s",
                            len(candidates),
                            search_radius_miles,
                            len(tag_group),
                        )
                        return candidates[:limit]

                    break

                if exhausted_attempts:
                    break
            if exhausted_attempts:
                break

    if successful_queries == 0 and last_rate_limit_error is not None:
        raise last_rate_limit_error
    if successful_queries == 0 and last_upstream_error is not None:
        raise last_upstream_error

    raise NoCandidatesFoundError("No named locations found matching this description in the given radius.")
