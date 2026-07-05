"""Unit tests for OpenStreetMap location-query shaping."""

from server.services.locations import (
    _build_overpass_query,
    _candidates_from_elements,
    _search_radii,
    _tag_groups,
    _tags_for_intent,
)


def test_romantic_photo_intent_uses_narrow_named_place_tags() -> None:
    tags = _tags_for_intent("romantic photos")

    assert ("leisure", "park") in tags
    assert ("tourism", "viewpoint") in tags
    assert ("natural", "water") not in tags
    assert len(tags) <= 3


def test_default_intent_avoids_broad_water_query() -> None:
    tags = _tags_for_intent("somewhere nice")

    assert tags == [("tourism", "viewpoint"), ("leisure", "park")]


def test_overpass_query_filters_to_named_features() -> None:
    query = _build_overpass_query(40.7128, -74.006, 1000.0, [("leisure", "park")])

    assert "[timeout:" in query
    assert 'node["leisure"="park"]["name"]' in query
    assert 'way["leisure"="park"]["name"]' in query
    assert "out center 30;" in query


def test_tag_groups_keep_overpass_queries_focused() -> None:
    tags = [("leisure", "park"), ("tourism", "viewpoint")]

    assert _tag_groups(tags) == [[("leisure", "park")], [("tourism", "viewpoint")]]


def test_search_radii_expand_from_nearby_to_requested_radius() -> None:
    assert _search_radii(0.5) == [0.5]
    assert _search_radii(2.0) == [1.0, 2.0]
    assert _search_radii(5.0) == [1.0, 3.0, 5.0]
    assert _search_radii(15.0) == [1.0, 3.0, 8.0, 15.0]


def test_candidates_ignore_unnamed_features() -> None:
    candidates = _candidates_from_elements(
        23.5791,
        58.4026,
        [
            {
                "type": "node",
                "id": 1,
                "lat": 23.58,
                "lon": 58.41,
                "tags": {"leisure": "park"},
            },
            {
                "type": "node",
                "id": 2,
                "lat": 23.58,
                "lon": 58.41,
                "tags": {"name": "Azaiba Beach Park", "leisure": "park"},
            },
        ],
    )

    assert len(candidates) == 1
    assert candidates[0].name == "Azaiba Beach Park"
    assert candidates[0].terrain_type == "urban park"
