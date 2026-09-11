# Root Coordinator Agent for orchestrating sub-agents and human-in-the-loop gates.

from google.adk import Agent
from google.adk.tools import FunctionTool, ToolContext

from .config import DEFAULT_CHEAP_MODEL
from .agents.summarizer_agent import summarizer_agent
from .agents.issue_explainer_agent import issue_explainer_agent
from .agents.orchestrator_agent import orchestrator_agent
from .tools.ingest_tools import build_graph_digest_tool, clone_repo_tool
from .tools.github_tools import fetch_issue_tool
from .tools.code_editor_tools import read_file_tool, write_file_tool, edit_file_tool, list_files_tool
from .tracing import logger


# Records user opt-in confirmation for agent handoff.
def confirm_handoff_opt_in(proceed: bool = True, tool_context: ToolContext | None = None) -> dict:
    logger.info("Opt-in confirmation: proceed=%s", proceed)
    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["user_opted_in"] = proceed
    return {
        "status": "opted_in" if proceed else "declined",
        "message": "Orchestrator handoff authorized." if proceed else "Handoff declined.",
        "authorized": proceed,
    }


confirm_opt_in_tool = FunctionTool(func=confirm_handoff_opt_in)

COORDINATOR_INSTRUCTION = """You are the flux AI Assistant, built with Google ADK.
Coordinate repository onboarding, AST dependency exploration, and autonomous issue resolution."""

root_agent = Agent(
    name="flux_root",
    description="flux Multi-Agent Assistant: Onboarding, Issue Triage, and Automated Handoff.",
    model=DEFAULT_CHEAP_MODEL,
    instruction=COORDINATOR_INSTRUCTION,
    sub_agents=[summarizer_agent, issue_explainer_agent, orchestrator_agent],
    tools=[
        clone_repo_tool,
        build_graph_digest_tool,
        fetch_issue_tool,
        confirm_opt_in_tool,
        read_file_tool,
        write_file_tool,
        edit_file_tool,
        list_files_tool,
    ],
)
flux_root = root_agent

