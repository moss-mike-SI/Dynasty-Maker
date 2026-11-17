from fastapi.testclient import TestClient

from dynasty import __version__
from dynasty.api.app import create_app


def test_health_reports_ok_and_version():
    response = TestClient(create_app()).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__}
