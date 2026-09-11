"""Complexity Router for flux Google ADK Workflow Runtime.

Implements deterministic graph-based routing based on:
- diff line count (< MAX_DIFF_LINES_FOR_PR)
- touched files count (<= MAX_FILES_TOUCHED_FOR_PR)
- validation pass/fail status

Branches:
- "pr": small/contained diff -> routes to publish_pr_tool
- "plan": large/cross-module or failed validation -> routes to generate_plan_artifact
"""

from typing import Any, Dict, Optional

from google.adk.tools import FunctionTool, ToolContext
from google.adk.workflow import FunctionNode
from ..config import (
    FALLBACK_DEMO_PLAN,
    MAX_DIFF_LINES_FOR_PR,
    MAX_FILES_TOUCHED_FOR_PR,
)
from ..tracing import logger


def evaluate_diff_complexity(
    diff_stats: Optional[Dict[str, Any]] = None,
    tool_context: Optional[ToolContext] = None,
) -> str:
    """Evaluates diff metrics to deterministically decide routing: 'pr' or 'plan'.

    Args:
        diff_stats: Optional dictionary of diff statistics (line_count, files_touched, validation_passed).
        tool_context: The ADK ToolContext for accessing and setting session state and route.

    Returns:
        The selected route string: 'pr' or 'plan'.
    """
    if diff_stats is None and tool_context and hasattr(tool_context, "state"):
        diff_stats = tool_context.state.get("diff_stats", {})

    diff_stats = diff_stats or {}
    line_count = diff_stats.get("line_count", 0)
    files_touched = diff_stats.get("files_touched", [])
    num_files = len(files_touched) if isinstance(files_touched, list) else 1
    validation_passed = diff_stats.get("validation_passed", True)

    logger.info(
        "Evaluating diff complexity: lines=%d (max=%d), files=%d (max=%d), validation=%s",
        line_count,
        MAX_DIFF_LINES_FOR_PR,
        num_files,
        MAX_FILES_TOUCHED_FOR_PR,
        validation_passed,
    )

    is_contained = (
        line_count <= MAX_DIFF_LINES_FOR_PR
        and num_files <= MAX_FILES_TOUCHED_FOR_PR
        and validation_passed
    )

    selected_route = "pr" if is_contained else "plan"

    if tool_context:
        if hasattr(tool_context, "state"):
            tool_context.state["routing_decision"] = selected_route
            tool_context.state["complexity_evaluation"] = {
                "line_count": line_count,
                "num_files": num_files,
                "validation_passed": validation_passed,
                "selected_route": selected_route,
                "threshold_lines": MAX_DIFF_LINES_FOR_PR,
                "threshold_files": MAX_FILES_TOUCHED_FOR_PR,
            }
        if hasattr(tool_context, "route"):
            tool_context.route = selected_route
        if hasattr(tool_context, "actions") and hasattr(tool_context.actions, "route"):
            tool_context.actions.route = selected_route

    logger.info("Complexity Router decided branch: %s", selected_route)
    return selected_route


def generate_plan_artifact(
    diff_stats: Optional[Dict[str, Any]] = None,
    tool_context: Optional[ToolContext] = None,
) -> Dict[str, Any]:
    """Generates a structured plan artifact when the diff is too complex for an automatic PR."""
    logger.info("Generating implementation plan artifact for complex diff")
    issue_context = ""
    if tool_context and hasattr(tool_context, "state"):
        issue_context = tool_context.state.get("issue_context", "")

    plan = dict(FALLBACK_DEMO_PLAN)
    if issue_context:
        plan["issue_context"] = issue_context[:300]

    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["plan_artifact"] = plan
        logger.info("Persisted plan_artifact into session state.")

    return plan


complexity_router_node = FunctionNode(
    func=evaluate_diff_complexity,
    name="complexity_router",
)

generate_plan_artifact_tool = FunctionTool(func=generate_plan_artifact)
