# End-to-End integration tests for Complexity Routing, PR Publishing, SQLite Persistence, and full workflow.

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest
import httpx
from main import app
from models.database import init_db, save_handoff_result, get_handoff_result
from agent.workflow.complexity_router import (
    evaluate_diff_complexity,
    evaluate_issue_pre_routing,
    generate_plan_artifact,
)
from agent.runner import run_agent_handoff
from agent.config import MAX_DIFF_LINES_FOR_PR, MAX_FILES_TOUCHED_FOR_PR


# Verifies agent system status endpoint and GitHub rate limit metadata.
@pytest.mark.asyncio
async def test_phase8_system_status_and_rate_limit():
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/agent/status")
        assert res.status_code == 200
        data = res.json()
        assert data["agent"] == "flux_root"
        assert "github" in data


# Verifies deterministic routing between Pull Request and Implementation Plan branches.
def test_phase7_complexity_routing_branches():
    small_stats = {"line_count": 42, "files_touched": ["src/main.py", "src/utils.py"], "validation_passed": True}
    assert evaluate_diff_complexity(diff_stats=small_stats) == "pr"

    large_stats = {"line_count": MAX_DIFF_LINES_FOR_PR + 50, "files_touched": ["src/main.py"], "validation_passed": True}
    assert evaluate_diff_complexity(diff_stats=large_stats) == "plan"

    broad_stats = {"line_count": 30, "files_touched": [f"file_{i}.py" for i in range(MAX_FILES_TOUCHED_FOR_PR + 2)], "validation_passed": True}
    assert evaluate_diff_complexity(diff_stats=broad_stats) == "plan"


# Verifies upfront complexity gate pre-routing for broad architectural issues.
def test_phase7_upfront_complexity_gate_pre_routing():
    res_files = evaluate_issue_pre_routing(
        issue_data={"title": "Update styles", "body": "Small CSS update"},
        relevant_files=["a.py", "b.py", "c.py", "d.py", "e.py"],
    )
    assert res_files == "plan"

    res_complexity = evaluate_issue_pre_routing(
        issue_data={"title": "Fix auth", "body": "Auth overhaul"},
        relevant_files=["src/auth.py"],
        estimated_complexity="High",
    )
    assert res_complexity == "plan"

    res_title = evaluate_issue_pre_routing(
        issue_data={"title": "refactor(rag): architect multi-tenant course isolation and vector database migration"},
        relevant_files=["backend/rag_engine.py", "backend/db.py"],
    )
    assert res_title == "plan"

    res_small = evaluate_issue_pre_routing(
        issue_data={"title": "fix: correct typo on login button label", "labels": ["bug"]},
        relevant_files=["frontend/LoginButton.tsx"],
        estimated_complexity="Low",
    )
    assert res_small is None


# Verifies run_agent_handoff bypasses code synthesis for architectural refactoring issues.
@pytest.mark.asyncio
async def test_phase7_run_agent_handoff_bypasses_code_synthesis_for_refactor():
    target_issue = {
        "title": "refactor(rag): architect multi-tenant course isolation and vector database migration",
        "body": "Decompose RAG engine into multi-tenant partitions.",
        "state": "open",
    }
    relevant_files = ["backend/rag.py", "backend/db.py", "backend/main.py", "frontend/App.jsx", "frontend/Portal.jsx"]

    result = await run_agent_handoff(
        owner="Roxy-06",
        repo="Eduzen",
        issue_number=11,
        issue_data=target_issue,
        relevant_files=relevant_files,
        opt_in=True,
        estimated_complexity="High",
    )

    assert result["status"] == "success"
    assert result["decision"] == "plan"
    assert result["diff"] == ""
    assert result["plan"] is not None


# Verifies generation of rich structured Plan Artifacts.
def test_phase7_plan_artifact_rich_generation():
    complex_stats = {
        "line_count": 240,
        "files_touched": ["backend/main.py", "backend/db.py", "frontend/App.jsx", "frontend/api.js", "frontend/nav.js"],
        "validation_passed": True,
    }
    plan = generate_plan_artifact(diff_stats=complex_stats)
    assert "title" in plan
    assert "steps" in plan
    assert len(plan["affected_modules"]) == 5
    assert "markdown_content" in plan


# Verifies saving and retrieving agent handoff results in SQLite and via API endpoint.
@pytest.mark.asyncio
async def test_phase7_sqlite_persistence_and_api_retrieval():
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
async def test_e2e_full_repository_flow():
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
async def test_phase7_two_step_diff_review_and_manual_pr_publish():
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
async def test_phase7_rollback_endpoint():
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        rb_res = await client.post("/api/repos/octocat/Hello-World/issues/101/rollback")
        assert rb_res.status_code == 200
        assert rb_res.json()["status"] == "rolled_back"


if __name__ == "__main__":
    sys.exit(pytest.main(["-v", __file__]))
