"""
Integration tests for FastAPI REST API endpoints using httpx AsyncClient.
Verifies health check, ingestion endpoint, detail retrieval, and listing.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import init_db


async def test_api_endpoints():
    """Runs async tests against FastAPI app instance via ASGI transport."""
    init_db()

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Health check
        res = await client.get("/api/health")
        assert res.status_code == 200, f"Health check failed: {res.text}"
        assert res.json()["status"] == "healthy"
        print("[PASS] GET /api/health returned 200 OK")

        # 2. Ingestion endpoint
        res = await client.post("/api/repos/ingest", json={"url": "octocat/Hello-World"})
        assert res.status_code == 200, f"Ingest endpoint failed: {res.text}"
        data = res.json()
        assert data["success"] is True
        assert data["repository"]["owner"] == "octocat"
        assert data["repository"]["name"] == "Hello-World"
        print("[PASS] POST /api/repos/ingest returned 200 OK")

        # 3. Get repository detail
        res = await client.get("/api/repos/octocat/Hello-World")
        assert res.status_code == 200, f"Get detail failed: {res.text}"
        assert res.json()["id"] == "octocat/hello-world"
        print("[PASS] GET /api/repos/octocat/Hello-World returned 200 OK")

        # 4. List repositories
        res = await client.get("/api/repos")
        assert res.status_code == 200, f"List failed: {res.text}"
        assert len(res.json()) >= 1
        print("[PASS] GET /api/repos returned 200 OK")

    print("--- All API Endpoints Verified Successfully! ---")


if __name__ == "__main__":
    asyncio.run(test_api_endpoints())
