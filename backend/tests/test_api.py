# End-to-end and integration tests for FastAPI REST API endpoints.

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import httpx
from main import app
from models.database import init_db, save_handoff_result, get_handoff_result
from agent.workflow.complexity_router import generate_plan_artifact
from agent.runner import run_agent_handoff


# Verifies the health check endpoint returns 200 OK and healthy status.
@pytest.mark.asyncio
async def test_health_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/health")
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"



# Verifies listing repositories returns an empty list initially.
@pytest.mark.asyncio
async def test_repos_list_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/repos")
        assert res.status_code == 200
        assert isinstance(res.json(), list)


# Verifies graph endpoint behavior for nonexistent repositories.
@pytest.mark.asyncio
async def test_graph_endpoints():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/repos/nonexistent/repo/graph")
        assert res.status_code == 404


# Verifies understanding endpoint returns 404 for non-analyzed repositories.
@pytest.mark.asyncio
async def test_understanding_endpoint():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/repos/nonexistent/repo/understand")
        assert res.status_code == 404


# Verifies agent system status endpoint and GitHub rate limit metadata.
@pytest.mark.asyncio
async def test_system_status_and_rate_limit():
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/agent/status")
        assert res.status_code == 200
        data = res.json()
        assert data["agent"] == "flux_root"
        assert "github" in data


# Verifies saving and retrieving agent handoff results in SQLite and via API endpoint.
@pytest.mark.asyncio
async def test_sqlite_persistence_and_api_retrieval():
    init_db()
    repo_id = "test-owner/test-complex-repo"
    issue_number = 42
    now_iso = datetime.now(timezone.utc).isoformat()

    complex_stats = {"line_count": 185, "files_touched": ["a.py", "b.py", "c.py", "d.py", "e.py"], "validation_passed": True}
    plan_obj = generate_plan_artifact(diff_stats=complex_stats)

    mock_handoff = {
        "status": "success",
        "authorized": True,
        "repo_id": repo_id,
        "issue_number": issue_number,
        "fork": {"fork_ref": "test-bot/test-complex-repo", "fork_url": "https://github.com/test-bot/test-complex-repo.git", "provisioned": True},
        "diff": "",
        "diff_stats": complex_stats,
        "decision": "plan",
        "pr": None,
        "plan": plan_obj,
        "message": "Generated Plan Artifact.",
    }

    save_handoff_result(repo_id, issue_number, mock_handoff, now_iso)
    cached = get_handoff_result(repo_id, issue_number)
    assert cached is not None
    assert cached["decision"] == "plan"

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/repos/test-owner/test-complex-repo/issues/{issue_number}/handoff")
        assert res.status_code == 200
        assert res.json()["decision"] == "plan"


# Verifies end-to-end repository ingestion, graph generation, and issue listing.
@pytest.mark.asyncio
async def test_full_repository_flow():
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        ingest_res = await client.post("/api/repos/ingest", json={"url": "https://github.com/octocat/Hello-World"}, timeout=30.0)
        assert ingest_res.status_code == 200

        graph_res = await client.post("/api/repos/octocat/Hello-World/graph/build")
        assert graph_res.status_code == 200

        issues_res = await client.get("/api/repos/octocat/Hello-World/issues")
        assert issues_res.status_code == 200


# Verifies two-step diff review and manual PR publication flow.
@pytest.mark.asyncio
async def test_two_step_diff_review_and_manual_pr_publish():
    init_db()
    owner = "octocat"
    repo = "Hello-World"
    issue_number = 99
    target_issue = {"title": "fix: correct typo in README", "body": "Small typo.", "state": "open"}

    result = await run_agent_handoff(
        owner=owner,
        repo=repo,
        issue_number=issue_number,
        issue_data=target_issue,
        relevant_files=["README.md"],
        opt_in=True,
        auto_publish_pr=False,
    )

    assert result["status"] == "success"
    assert result["decision"] == "pr"
    assert result["pr"] is None

    now_iso = datetime.now(timezone.utc).isoformat()
    save_handoff_result(f"{owner}/{repo}", issue_number, result, now_iso)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        pub_res = await client.post(
            f"/api/repos/{owner}/{repo}/issues/{issue_number}/publish-pr",
            json={"diff": result["diff"], "fork_ref": result["fork"]["fork_ref"]},
        )
        assert pub_res.status_code == 200
        assert pub_res.json()["status"] == "success"


# Verifies rollback endpoint for discarding changes and resetting branch.
@pytest.mark.asyncio
async def test_rollback_endpoint():
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        rb_res = await client.post("/api/repos/octocat/Hello-World/issues/101/rollback")
        assert rb_res.status_code == 200
        assert rb_res.json()["status"] == "rolled_back"


if __name__ == "__main__":
    sys.exit(pytest.main(["-v", __file__]))
