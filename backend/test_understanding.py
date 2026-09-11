# Unit and integration tests for repository digest generation and plain-English understanding.

import asyncio
import json
import sys
from pathlib import Path

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


# Verifies repository prompt digest generation contains metadata, metrics, and documentation.
def test_digest_builder():
    init_db()
    repo_record = get_repository_by_id("octocat/hello-world")
    assert repo_record is not None
    graph_record = get_graph_by_repo_id("octocat/hello-world")
    assert graph_record is not None

    graph_resp = GraphResponse(**json.loads(graph_record["graph_json"]))
    digest = build_repository_digest(repo_record, graph_resp)
    assert "# Repository Digest: octocat/Hello-World" in digest
    assert "## Dependency Graph Metrics" in digest


# Verifies grounded understanding generation returns complete overview, feature map, and flows.
async def test_llm_grounded_understanding():
    init_db()
    repo_record = get_repository_by_id("octocat/hello-world")
    assert repo_record is not None
    graph_record = get_graph_by_repo_id("octocat/hello-world")
    assert graph_record is not None

    graph_resp = GraphResponse(**json.loads(graph_record["graph_json"]))
    digest = build_repository_digest(repo_record, graph_resp)
    understanding = await generate_repository_understanding(repo_record, digest, "octocat/hello-world")

    assert understanding.repo_id == "octocat/hello-world"
    assert len(understanding.overview) > 10
    assert len(understanding.feature_map) >= 1
    assert len(understanding.flows) >= 1


# Verifies POST and GET understanding API endpoints via FastAPI ASGI transport.
async def test_understanding_api_endpoints():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        post_res = await client.post("/api/repos/octocat/Hello-World/understand")
        assert post_res.status_code == 200
        data = post_res.json()
        assert data["repo_id"] == "octocat/hello-world"
        assert "overview" in data

        get_res = await client.get("/api/repos/octocat/Hello-World/understand")
        assert get_res.status_code == 200
        assert get_res.json()["repo_id"] == "octocat/hello-world"
        assert get_understanding_by_repo_id("octocat/hello-world") is not None


if __name__ == "__main__":
    test_digest_builder()
    asyncio.run(test_llm_grounded_understanding())
    asyncio.run(test_understanding_api_endpoints())
