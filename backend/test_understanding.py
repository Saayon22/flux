"""
Automated unit and integration tests for Phase 3: Repository Understanding.
Verifies compact digest generation, grounded understanding synthesis,
SQLite persistence, and REST API endpoints.
"""

import asyncio
import sys
from pathlib import Path

# Ensure backend directory is in python search path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import httpx
from main import app
from models.database import (
    init_db,
    get_repository_by_id,
    get_graph_by_repo_id,
    get_understanding_by_repo_id,
)
from models.graph import GraphResponse
from services.digest import build_repository_digest
from services.llm import generate_repository_understanding


def test_digest_builder():
    """Verify repository digest contains metadata, metrics, central files, and documentation."""
    init_db()
    repo_record = get_repository_by_id("octocat/hello-world")
    assert repo_record is not None, "octocat/hello-world must be ingested first"

    graph_record = get_graph_by_repo_id("octocat/hello-world")
    assert graph_record is not None, "Graph must be built first"

    import json
    graph_resp = GraphResponse(**json.loads(graph_record["graph_json"]))
    digest = build_repository_digest(repo_record, graph_resp)

    assert "# Repository Digest: octocat/Hello-World" in digest
    assert "## Dependency Graph Metrics" in digest
    assert "## Documentation Highlights" in digest
    print("[PASS] Repository digest generation verified")
    return repo_record, digest


async def test_llm_grounded_understanding(repo_record, digest):
    """Verify grounded understanding generation returns complete overview, feature map, and flows."""
    understanding = await generate_repository_understanding(repo_record, digest, "octocat/hello-world")

    assert understanding.repo_id == "octocat/hello-world"
    assert len(understanding.overview) > 20
    assert len(understanding.architecture_summary) > 20
    assert len(understanding.feature_map) >= 1
    assert len(understanding.flows) >= 1
    assert understanding.model_used is not None
    print(f"[PASS] Understanding generated successfully (Model: {understanding.model_used}, Fallback: {understanding.is_fallback})")


async def test_understanding_api_endpoints():
    """Verify POST and GET understanding endpoints via FastAPI ASGI transport."""
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # 1. Post to generate understanding
        post_res = await client.post("/api/repos/octocat/Hello-World/understand")
        assert post_res.status_code == 200, f"Generate failed: {post_res.text}"
        data = post_res.json()
        assert data["repo_id"] == "octocat/hello-world"
        assert "overview" in data
        assert "architecture_summary" in data
        assert "feature_map" in data
        assert "flows" in data
        print("[PASS] POST /api/repos/{owner}/{repo}/understand returned 200 OK")

        # 2. Get cached understanding
        get_res = await client.get("/api/repos/octocat/Hello-World/understand")
        assert get_res.status_code == 200, f"Get failed: {get_res.text}"
        assert get_res.json()["repo_id"] == "octocat/hello-world"
        print("[PASS] GET /api/repos/{owner}/{repo}/understand returned 200 OK")

        # 3. Verify SQLite persistence
        record = get_understanding_by_repo_id("octocat/hello-world")
        assert record is not None
        assert record["repo_id"] == "octocat/hello-world"
        print("[PASS] Repository understanding SQLite persistence verified")


if __name__ == "__main__":
    print("--- Running Phase 3 Tests ---")
    repo_rec, dig = test_digest_builder()
    asyncio.run(test_llm_grounded_understanding(repo_rec, dig))
    asyncio.run(test_understanding_api_endpoints())
    print("--- All Phase 3 Tests Passed Successfully! ---")
