# Unit and integration tests for Google ADK Coordinator, subagents, tools, complexity router, and handoff workflow.

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from agent.config import MAX_DIFF_LINES_FOR_PR, MAX_FILES_TOUCHED_FOR_PR
from agent.coordinator import flux_root
from agent.runner import run_agent_handoff, AgentRunner
from agent.workflow.complexity_router import (
    evaluate_diff_complexity,
    evaluate_issue_pre_routing,
    generate_plan_artifact,
)


# Verifies the coordinator agent exposes required subagent tool mappings.
def test_agent_status():
    assert flux_root is not None
    assert flux_root.name == "flux_root"
    tool_names = [getattr(t, "name", str(t)) for t in (flux_root.tools or [])]
    assert len(tool_names) > 0


# Verifies that handoff requires explicit Human-in-the-Loop opt-in.
@pytest.mark.asyncio
async def test_agent_handoff_opt_in_gate():
    res = await run_agent_handoff(
        owner="octocat",
        repo="Hello-World",
        issue_number=1,
        issue_data={"title": "Test Issue", "body": "Fix bug in Hello-World"},
        relevant_files=["README"],
        opt_in=False,
    )
    assert res["status"] in ["gated", "declined"]
    assert res["authorized"] is False



# Verifies chat session routing returns structured conversational responses.
@pytest.mark.asyncio
async def test_agent_chat_session():
    res = await AgentRunner.run_turn("What does this repo do?", session_id="test_sess_001")
    assert "response" in res
    assert "session_id" in res
    assert res["session_id"] == "test_sess_001"


# Verifies deterministic routing between Pull Request and Implementation Plan branches.
def test_complexity_routing_branches():
    small_stats = {"line_count": 42, "files_touched": ["src/main.py", "src/utils.py"], "validation_passed": True}
    assert evaluate_diff_complexity(diff_stats=small_stats) == "pr"

    large_stats = {"line_count": MAX_DIFF_LINES_FOR_PR + 50, "files_touched": ["src/main.py"], "validation_passed": True}
    assert evaluate_diff_complexity(diff_stats=large_stats) == "plan"

    broad_stats = {"line_count": 30, "files_touched": [f"file_{i}.py" for i in range(MAX_FILES_TOUCHED_FOR_PR + 2)], "validation_passed": True}
    assert evaluate_diff_complexity(diff_stats=broad_stats) == "plan"


# Verifies upfront complexity gate pre-routing for broad architectural issues.
def test_upfront_complexity_gate_pre_routing():
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
async def test_run_agent_handoff_bypasses_code_synthesis_for_refactor():
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
def test_plan_artifact_rich_generation():
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


# Verifies end-to-end agent handoff execution for contained bug fixes.
@pytest.mark.asyncio
async def test_agent_integration():
    res = await run_agent_handoff(
        owner="octocat",
        repo="Hello-World",
        issue_number=1,
        issue_data={"title": "Fix typo in README", "body": "Small typo in README.md", "state": "open"},
        relevant_files=["README"],
        opt_in=True,
    )
    assert res["status"] in ["success", "mocked_success"]
    assert res["authorized"] is True
    assert "decision" in res
    assert "fork" in res


if __name__ == "__main__":
    sys.exit(pytest.main(["-v", __file__]))
