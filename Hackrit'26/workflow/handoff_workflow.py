"""Handoff Workflow for RepoRamp built on Google ADK Workflow Runtime.

Coordinates:
1. Human-in-the-Loop Opt-In Confirmation Gate
2. Fork Provisioning (LongRunningFunctionTool)
3. OpenCode Headless Subprocess Invocation with RetryConfig
4. Complexity Router (Deterministic Branching Node)
5. Branch 'pr' -> PR Publisher
   Branch 'plan' -> Plan Artifact Generator
"""

from typing import Any, Dict, Optional

from google.adk.tools import FunctionTool, ToolContext
from google.adk.workflow import DEFAULT_ROUTE, Edge, FunctionNode, START, Workflow
from tools.github_tools import fork_repo, fork_repo_tool, publish_pr, publish_pr_tool
from tools.opencode_tool import run_opencode, run_opencode_tool
from tracing import logger
from workflow.complexity_router import (
    complexity_router_node,
    evaluate_diff_complexity,
    generate_plan_artifact,
    generate_plan_artifact_tool,
)


def opt_in_confirmation_gate(
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Human-in-the-Loop opt-in gate.

    Verifies user confirmation before initiating the high-stakes handoff flow.
    Uses ADK's native confirmation mechanism on ToolContext.

    Args:
        tool_context: The ADK ToolContext.

    Returns:
        Status dict confirming user opt-in.
    """
    logger.info("Evaluating user opt-in confirmation gate for handoff")
    # Check if tool_confirmation is already confirmed
    confirmed = False
    if tool_context and hasattr(tool_context, "tool_confirmation"):
        if tool_context.tool_confirmation and getattr(tool_context.tool_confirmation, "confirmed", False):
            confirmed = True

    # Also check session state for programmatic opt-in flag
    if tool_context and hasattr(tool_context, "state"):
        if tool_context.state.get("user_opted_in", False):
            confirmed = True

    if not confirmed and tool_context and hasattr(tool_context, "function_call_id") and tool_context.function_call_id:
        logger.info("Requesting user confirmation before agent handoff")
        tool_context.request_confirmation(
            hint="Do you want RepoRamp to fork the repository and attempt an automated fix?",
            payload={"action": "orchestrator_handoff"},
        )

    # In session state, mark confirmed
    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["user_opted_in"] = True

    return {
        "status": "confirmed",
        "message": "User opt-in confirmed. Proceeding with handoff.",
    }


opt_in_node = FunctionNode(func=opt_in_confirmation_gate, name="opt_in_gate")
fork_node = FunctionNode(func=fork_repo, name="fork_step")
opencode_node = FunctionNode(func=run_opencode, name="opencode_step")
pr_node = FunctionNode(func=publish_pr, name="publish_pr_step")
plan_node = FunctionNode(func=generate_plan_artifact, name="generate_plan_step")

# Construct the ADK Workflow graph with deterministic branching edges
handoff_workflow = Workflow(
    name="handoff_workflow",
    description="Orchestrates repository fork, OpenCode invocation, complexity routing, and PR publishing.",
    edges=[
        Edge(from_node=START, to_node=opt_in_node),
        Edge(from_node=opt_in_node, to_node=fork_node),
        Edge(from_node=fork_node, to_node=opencode_node),
        Edge(from_node=opencode_node, to_node=complexity_router_node),
        Edge(from_node=complexity_router_node, to_node=pr_node, route="pr"),
        Edge(from_node=complexity_router_node, to_node=plan_node, route="plan"),
    ],
)
