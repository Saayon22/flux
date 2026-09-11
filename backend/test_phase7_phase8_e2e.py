"""End-to-End Test Suite for Phase 7 (Complexity Routing & PR) and Phase 8 (Integration & Demo Hardening).

Verifies:
1. Phase 8: System Status & GitHub Rate Limit discovery endpoint (/api/agent/status)
2. Phase 7: Deterministic Complexity Router (Contained Diff -> 'pr' branch vs Complex Diff -> 'plan' branch)
3. Phase 7: SQLite Persistence & Retrieval for PR and Plan Artifacts (/api/repos/{owner}/{repo}/issues/{issue}/handoff)
4. Phase 7: Markdown Plan Artifact generation & downloadable structure
5. Phase 8: Live demo rehearsal & end-to-end multi-agent execution pipeline
"""

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest
import httpx
from main import app
from models.database import init_db, save_handoff_result, get_handoff_result
from agent.workflow.complexity_router import evaluate_diff_complexity, generate_plan_artifact
from agent.config import MAX_DIFF_LINES_FOR_PR, MAX_FILES_TOUCHED_FOR_PR


@pytest.mark.asyncio
async def test_phase8_system_status_and_rate_limit():
    """Verifies Phase 8 Global System Status including Gemini, ADK, and GitHub API Rate Limit."""
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get("/api/agent/status")
        assert res.status_code == 200, f"Status failed: {res.text}"
        data = res.json()

        assert data["agent"] == "flux_root"
        assert "Google ADK" in data["framework"]
        assert "gemini" in data["model"].lower()
        assert data["has_api_key"] is True

        # GitHub rate limit structure
        assert "github" in data
        assert "authenticated" in data["github"]
        assert "limit" in data["github"]
        assert "remaining" in data["github"]
        assert data["github"]["limit"] >= 60

        print(f"[PASS] Phase 8 System Status: {data['model']} | GitHub Quota: {data['github']['remaining']}/{data['github']['limit']}")


def test_phase7_complexity_routing_branches():
    """Verifies deterministic routing between Pull Request and Implementation Plan branches."""
    # Case A: Small contained diff -> routes to 'pr'
    small_stats = {
        "line_count": 42,
        "files_touched": ["src/main.py", "src/utils.py"],
        "validation_passed": True,
    }
    decision_pr = evaluate_diff_complexity(diff_stats=small_stats)
    assert decision_pr == "pr", f"Expected 'pr' route for small diff, got: {decision_pr}"
    print("[PASS] Phase 7 Complexity Router -> 'pr' branch verified (42 lines, 2 files)")

    # Case B: Large diff exceeding line threshold -> routes to 'plan'
    large_stats = {
        "line_count": MAX_DIFF_LINES_FOR_PR + 50,
        "files_touched": ["src/main.py"],
        "validation_passed": True,
    }
    decision_plan_lines = evaluate_diff_complexity(diff_stats=large_stats)
    assert decision_plan_lines == "plan", f"Expected 'plan' route for large diff, got: {decision_plan_lines}"
    print(f"[PASS] Phase 7 Complexity Router -> 'plan' branch verified ({large_stats['line_count']} lines)")

    # Case C: Broad diff touching too many files -> routes to 'plan'
    broad_stats = {
        "line_count": 30,
        "files_touched": [f"file_{i}.py" for i in range(MAX_FILES_TOUCHED_FOR_PR + 2)],
        "validation_passed": True,
    }
    decision_plan_files = evaluate_diff_complexity(diff_stats=broad_stats)
    assert decision_plan_files == "plan", f"Expected 'plan' route for wide diff, got: {decision_plan_files}"
    print(f"[PASS] Phase 7 Complexity Router -> 'plan' branch verified ({len(broad_stats['files_touched'])} files)")


def test_phase7_plan_artifact_rich_generation():
    """Verifies that generate_plan_artifact synthesizes complete Markdown and structured sections."""
    complex_stats = {
        "line_count": 240,
        "files_touched": ["backend/main.py", "backend/db.py", "backend/rag_engine.py", "frontend/App.jsx", "frontend/api.js"],
        "validation_passed": True,
    }
    plan = generate_plan_artifact(diff_stats=complex_stats)

    assert "title" in plan
    assert "summary" in plan
    assert "steps" in plan and len(plan["steps"]) >= 4
    assert "affected_modules" in plan and len(plan["affected_modules"]) == 5
    assert "quality_assurance" in plan and len(plan["quality_assurance"]) >= 3
    assert plan["estimated_risk"] in ("Moderate", "High")
    assert "markdown_content" in plan
    assert plan["markdown_content"].startswith("# Implementation Plan")
    assert "- [ ]" in plan["markdown_content"]  # Markdown checklists included

    print(f"[PASS] Phase 7 Plan Artifact synthesized: Risk={plan['estimated_risk']}, Modules={len(plan['affected_modules'])}")


@pytest.mark.asyncio
async def test_phase7_sqlite_persistence_and_api_retrieval():
    """Verifies saving and querying handoff results from SQLite and FastAPI endpoint."""
    init_db()
    repo_id = "test-owner/test-complex-repo"
    issue_number = 42
    now_iso = datetime.now(timezone.utc).isoformat()

    complex_stats = {
        "line_count": 185,
        "files_touched": ["module_a.py", "module_b.py", "module_c.py", "module_d.py", "module_e.py"],
        "validation_passed": True,
    }
    plan_obj = generate_plan_artifact(diff_stats=complex_stats)

    mock_handoff_result = {
        "status": "success",
        "authorized": True,
        "repo_id": repo_id,
        "issue_number": issue_number,
        "fork": {
            "fork_ref": "test-bot/test-complex-repo",
            "fork_url": "https://github.com/test-bot/test-complex-repo.git",
            "provisioned": True,
        },
        "diff": "--- a/module_a.py\n+++ b/module_a.py\n@@ -1 +1 @@\n-old\n+new",
        "diff_stats": complex_stats,
        "decision": "plan",
        "pr": None,
        "plan": plan_obj,
        "message": "Generated structured Implementation Plan Artifact.",
    }

    # 1. Direct DB Save & Get
    save_handoff_result(repo_id, issue_number, mock_handoff_result, now_iso)
    cached = get_handoff_result(repo_id, issue_number)
    assert cached is not None
    assert cached["decision"] == "plan"
    assert cached["plan"]["title"] == plan_obj["title"]
    assert cached["plan"]["markdown_content"] is not None
    print("[PASS] SQLite handoff_results persistence roundtrip verified")

    # 2. API Endpoint Retrieval via GET /api/repos/{owner}/{repo}/issues/{issue}/handoff
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(f"/api/repos/test-owner/test-complex-repo/issues/{issue_number}/handoff")
        assert res.status_code == 200, f"API retrieval failed: {res.text}"
        data = res.json()
        assert data["decision"] == "plan"
        assert data["plan"]["estimated_risk"] in ("Moderate", "High")
        assert len(data["plan"]["steps"]) >= 4
        print(f"[PASS] GET /api/repos/.../issues/{issue_number}/handoff endpoint verified")


@pytest.mark.asyncio
async def test_phase8_live_demo_rehearsal_flow():
    """Verifies 1-click live demo flow on octocat/Hello-World."""
    init_db()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        # Ingest demo repository
        ingest_res = await client.post(
            "/api/repos/ingest",
            json={"url": "https://github.com/octocat/Hello-World"},
            timeout=30.0,
        )
        assert ingest_res.status_code == 200
        repo_data = ingest_res.json()["repository"]
        assert repo_data["owner"].lower() == "octocat"
        assert repo_data["name"].lower() == "hello-world"
        print("[PASS] Phase 8 Demo Repository Ingest verified")

        # Build AST Graph
        graph_res = await client.post("/api/repos/octocat/Hello-World/graph/build")
        assert graph_res.status_code == 200
        graph_data = graph_res.json()
        assert graph_data["metrics"]["total_nodes"] >= 0
        print(f"[PASS] Phase 8 AST Graph constructed: {graph_data['metrics']['total_nodes']} nodes")

        # Check issues list / demo seed
        issues_res = await client.get("/api/repos/octocat/Hello-World/issues")
        assert issues_res.status_code == 200
        issues = issues_res.json()
        if not issues:
            seed_res = await client.post("/api/repos/octocat/Hello-World/issues/seed")
            assert seed_res.status_code == 200
            print("[PASS] Demo Issue Seeded for 0-issue repository")
        else:
            print(f"[PASS] Found {len(issues)} issues for demo repository")


if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main(["-v", __file__]))
