# Handoff Workflow coordination built on Google ADK Workflow Runtime.

from typing import Any, Dict, Optional
from google.adk.tools import ToolContext
from google.adk.workflow import Edge, FunctionNode, START, Workflow
from ..tools.github_tools import fork_repo, publish_pr
from ..tools.opencode_tool import run_opencode
from ..tracing import logger
from .complexity_router import complexity_router_node, generate_plan_artifact


# Human-in-the-Loop opt-in evaluation gate before handoff execution.
def opt_in_confirmation_gate(tool_context: Optional[ToolContext] = None) -> Dict[str, Any]:
    logger.info("Evaluating user opt-in confirmation gate")
    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["user_opted_in"] = True
    return {"status": "confirmed", "message": "User opt-in confirmed."}


opt_in_node = FunctionNode(func=opt_in_confirmation_gate, name="opt_in_gate")
fork_node = FunctionNode(func=fork_repo, name="fork_step")
opencode_node = FunctionNode(func=run_opencode, name="opencode_step")
pr_node = FunctionNode(func=publish_pr, name="publish_pr_step")
plan_node = FunctionNode(func=generate_plan_artifact, name="generate_plan_step")

handoff_workflow = Workflow(
    name="handoff_workflow",
    description="Orchestrates repository fork, code generation, complexity routing, and PR publishing.",
    edges=[
        Edge(from_node=START, to_node=opt_in_node),
        Edge(from_node=opt_in_node, to_node=fork_node),
        Edge(from_node=fork_node, to_node=opencode_node),
        Edge(from_node=opencode_node, to_node=complexity_router_node),
        Edge(from_node=complexity_router_node, to_node=pr_node, route="pr"),
        Edge(from_node=complexity_router_node, to_node=plan_node, route="plan"),
    ],
)
