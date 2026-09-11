# Integration tests for FastAPI REST API endpoints using httpx AsyncClient.

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db


# Runs asynchronous integration tests against FastAPI application endpoints.
async def test_api_endpoints():
    init_db()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Health check verification
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"

        # Ingestion endpoint verification
        res = await client.post("/api/repos/ingest", json={"url": "octocat/Hello-World"})
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["repository"]["owner"] == "octocat"
        assert data["repository"]["name"] == "Hello-World"

        # Repository detail retrieval
        res = await client.get("/api/repos/octocat/Hello-World")
        assert res.status_code == 200
        assert res.json()["id"] == "octocat/hello-world"

        # Repository listing
        res = await client.get("/api/repos")
        assert res.status_code == 200
        assert len(res.json()) >= 1

        # File content inspection
        res = await client.get("/api/repos/octocat/Hello-World/files/content", params={"path": "README"})
        assert res.status_code == 200
        assert res.json()["path"] == "README"

        # Traversal security check
        res = await client.get("/api/repos/octocat/Hello-World/files/content", params={"path": "../../main.py"})
        assert res.status_code in (403, 404)


if __name__ == "__main__":
    asyncio.run(test_api_endpoints())
