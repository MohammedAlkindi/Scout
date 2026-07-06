from fastapi.testclient import TestClient

from server.api import app


def test_diagnostics_exposes_safe_process_metrics() -> None:
    client = TestClient(app)

    client.get("/api/health")
    response = client.get("/api/diagnostics")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert isinstance(body["counters"], dict)
    assert isinstance(body["recent_events"], list)
    assert "raw_intent" not in response.text
    assert "latitude" not in response.text
    assert "longitude" not in response.text
