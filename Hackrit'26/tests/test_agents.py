"""Unit and Integration Tests for RepoRamp ADK Agent System.

Validates:
- Static analysis & AST graph construction with Louvain clustering
- LongRunningFunctionTool for fork provisioning
- OpenCode headless invocation with fallback diff
- Deterministic Complexity Router branching
- Human-in-the-Loop confirmation gate
- Multi-Agent coordination & session state persistence
"""

import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from google.adk.tools import LongRunningFunctionTool, ToolContext
from google.adk.workflow import Edge, START, Workflow

from agent import confirm_handoff_opt_in, root_agent
from agents.issue_explainer_agent import issue_explainer_agent
from agents.orchestrator_agent import orchestrator_agent
from agents.summarizer_agent import summarizer_agent
from config import (
    DEFAULT_CHEAP_MODEL,
    DEFAULT_STRONGEST_MODEL,
    FALLBACK_DEMO_DIFF,
    MAX_DIFF_LINES_FOR_PR,
)
from tools.github_tools import (
    fetch_issue,
    fetch_issue_tool,
    fork_repo,
    fork_repo_tool,
    publish_pr,
    publish_pr_tool,
)
from tools.ingest_tools import (
    build_graph_digest,
    build_graph_digest_tool,
    clone_repo,
    clone_repo_tool,
    parse_ast,
    parse_ast_tool,
)
from tools.opencode_tool import run_opencode, run_opencode_tool
from workflow.complexity_router import (
    complexity_router_node,
    evaluate_diff_complexity,
    generate_plan_artifact,
)
from workflow.handoff_workflow import handoff_workflow, opt_in_confirmation_gate


class MockToolContext:
    """Mock ADK ToolContext to simulate session state across pipeline turns."""

    def __init__(self, initial_state=None):
        self.state = initial_state or {}
        self.route = None
        self.function_call_id = "call_mock_123"
        self.requested_confirmations = []

    def request_confirmation(self, hint=None, payload=None):
        self.requested_confirmations.append({"hint": hint, "payload": payload})


@pytest.fixture
def temp_repo():
    """Creates a temporary sample repository with Python code for AST testing."""
    temp_dir = tempfile.mkdtemp(prefix="reporamp_test_")
    src_dir = Path(temp_dir) / "src"
    src_dir.mkdir(parents=True)

    module_a = src_dir / "handler.py"
    module_a.write_text(
        "class EventHandler:\n"
        "    def process(self, event):\n"
        "        return validate_event(event)\n\n"
        "def validate_event(event):\n"
        "    return bool(event)\n",
        encoding="utf-8",
    )

    module_b = src_dir / "service.py"
    module_b.write_text(
        "from handler import EventHandler\n\n"
        "def run_service():\n"
        "    h = EventHandler()\n"
        "    return h.process({'type': 'ping'})\n",
        encoding="utf-8",
    )

    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


def test_ast_parsing_and_graph_digest(temp_repo):
    """Verifies that AST parsing and Louvain clustering build a structured graph digest."""
    ctx = MockToolContext()
    ast_res = parse_ast(temp_repo, tool_context=ctx)
    assert ast_res["status"] == "success"
    assert ast_res["node_count"] > 0
    assert ast_res["edge_count"] > 0

    digest = build_graph_digest(temp_repo, tool_context=ctx)
    assert digest["status"] == "success"
    assert digest["total_nodes"] > 0
    assert digest["num_clusters"] >= 1
    assert "graph_digest" in ctx.state
    assert len(ctx.state["relevant_files"]) > 0


def test_github_issue_and_fork_tools():
    """Verifies issue fetching and LongRunningFunctionTool fork provisioning."""
    ctx = MockToolContext()
    issue_data = fetch_issue("octocat/Hello-World", "42", tool_context=ctx)
    assert issue_data["status"] in ("success", "fallback")
    assert ctx.state["issue_id"] == "42"

    assert isinstance(fork_repo_tool, LongRunningFunctionTool)
    fork_res = fork_repo("https://github.com/octocat/Hello-World", tool_context=ctx)
    assert fork_res is not None
    assert fork_res["status"] == "ready"
    assert "fork_ref" in ctx.state
    assert "octocat" in ctx.state["fork_ref"] or "reporamp-bot" in ctx.state["fork_ref"]


def test_opencode_headless_and_fallback():
    """Verifies OpenCode headless invocation, diff stats, and demo fallback resilience."""
    ctx = MockToolContext(initial_state={"relevant_files": ["src/handler.py"]})
    res = run_opencode("Fix null check bug", tool_context=ctx)

    assert res["status"] == "success"
    assert res["diff"] is not None
    assert "line_count" in res
    assert "files_touched" in res
    assert "diff" in ctx.state
    assert "diff_stats" in ctx.state


def test_complexity_router_deterministic_branching():
    """Verifies that the Complexity Router branches deterministically based on metrics."""
    ctx_small = MockToolContext()
    small_stats = {
        "line_count": 25,
        "files_touched": ["src/handler.py"],
        "validation_passed": True,
    }
    route_small = evaluate_diff_complexity(small_stats, tool_context=ctx_small)
    assert route_small == "pr"
    assert ctx_small.state["routing_decision"] == "pr"

    ctx_large = MockToolContext()
    large_stats = {
        "line_count": MAX_DIFF_LINES_FOR_PR + 50,
        "files_touched": ["a.py", "b.py", "c.py", "d.py", "e.py"],
        "validation_passed": True,
    }
    route_large = evaluate_diff_complexity(large_stats, tool_context=ctx_large)
    assert route_large == "plan"
    assert ctx_large.state["routing_decision"] == "plan"

    ctx_failed_validation = MockToolContext()
    failed_stats = {
        "line_count": 10,
        "files_touched": ["src/handler.py"],
        "validation_passed": False,
    }
    route_failed = evaluate_diff_complexity(failed_stats, tool_context=ctx_failed_validation)
    assert route_failed == "plan"


def test_plan_artifact_generation():
    """Verifies plan artifact generation for complex or high-risk changes."""
    ctx = MockToolContext(initial_state={"issue_context": "Refactor multi-module data flow"})
    plan = generate_plan_artifact(tool_context=ctx)
    assert "title" in plan
    assert "steps" in plan
    assert len(plan["steps"]) > 0
    assert "plan_artifact" in ctx.state


def test_human_in_the_loop_opt_in_gate():
    """Verifies that the opt-in gate controls authorization state."""
    ctx = MockToolContext()
    decline_res = confirm_handoff_opt_in(proceed=False, tool_context=ctx)
    assert decline_res["authorized"] is False
    assert ctx.state["handoff_aborted"] is True

    accept_res = confirm_handoff_opt_in(proceed=True, tool_context=ctx)
    assert accept_res["authorized"] is True
    assert ctx.state["user_opted_in"] is True


def test_modular_multi_agent_system_structure():
    """Verifies that the Multi-Agent System correctly configures models and roles."""
    assert root_agent.name == "reporamp_root"
    assert root_agent.model == DEFAULT_CHEAP_MODEL
    assert len(root_agent.sub_agents) == 3

    sub_agent_names = [sa.name for sa in root_agent.sub_agents]
    assert "summarizer_agent" in sub_agent_names
    assert "issue_explainer_agent" in sub_agent_names
    assert "orchestrator_agent" in sub_agent_names

    assert summarizer_agent.model == DEFAULT_CHEAP_MODEL
    assert issue_explainer_agent.model == DEFAULT_CHEAP_MODEL
    assert orchestrator_agent.model == DEFAULT_STRONGEST_MODEL


def test_handoff_workflow_graph_structure():
    """Verifies the ADK Workflow graph edges and deterministic routes."""
    assert handoff_workflow.name == "handoff_workflow"
    assert len(handoff_workflow.edges) == 6

    pr_edges = [e for e in handoff_workflow.edges if getattr(e, "route", None) == "pr"]
    plan_edges = [e for e in handoff_workflow.edges if getattr(e, "route", None) == "plan"]
    assert len(pr_edges) == 1
    assert len(plan_edges) == 1
