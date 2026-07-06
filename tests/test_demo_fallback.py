"""Regression tests for the bundled demo recommendation fallback."""

import asyncio

import pytest

from server import orchestration
from server.errors import UpstreamServiceError
from server.services.scorer import ShotType


async def _failing_locations(*args: object, **kwargs: object) -> object:
    raise UpstreamServiceError("Location search is temporarily unavailable.")


def test_muscat_demo_request_uses_bundled_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(orchestration, "_find_locations_cached", _failing_locations)

    result = asyncio.run(
        orchestration.build_recommendation(
            23.5793,
            58.4025,
            "sunset landscape near the coast",
            15.0,
            ShotType.LANDSCAPE,
        )
    )

    assert result.demo_mode is True
    assert result.source_note is not None
    assert len(result.recommendations) == 3
    assert result.recommendations[0].location_name == "Azaiba Beach Park"
    assert "Demo fallback" in result.recommendations[0].caveats[0]


def test_non_demo_request_does_not_hide_provider_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(orchestration, "_find_locations_cached", _failing_locations)

    with pytest.raises(UpstreamServiceError):
        asyncio.run(
            orchestration.build_recommendation(
                37.7749,
                -122.4194,
                "quiet portrait location with soft light",
                15.0,
                ShotType.PORTRAIT,
            )
        )
