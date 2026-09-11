"""flux Root Agent Coordinator (Google ADK).

Exposes root_agent per ADK's code-first convention.
Coordinates:
- Summarizer Agent (gemini-3.6-flash): architecture summaries & graph digests
- Issue Explainer Agent (gemini-3.6-flash): 1-hop issue triage
- Orchestrator Agent (gemini-3.6-flash): high-stakes handoff with fork, code generation, and Complexity Router
- Human-in-the-Loop opt-in gate
- Shared session state across pipeline turns
"""

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


def confirm_handoff_opt_in(
    proceed: bool = True,
    tool_context: ToolContext | None = None,
) -> dict:
    """Records the user's explicit opt-in confirmation for agent handoff.

    Human-in-the-Loop confirmation gate: ensures the Orchestrator agent
    is only triggered after explicit confirmation from the user.
    """
    logger.info("Human-in-the-Loop confirmation received: proceed=%s", proceed)
    if tool_context and hasattr(tool_context, "state"):
        tool_context.state["user_opted_in"] = proceed
        if not proceed:
            tool_context.state["handoff_aborted"] = True

    if proceed:
        return {
            "status": "opted_in",
            "message": "User confirmed opt-in. Orchestrator handoff authorized.",
            "authorized": True,
        }
    return {
        "status": "declined",
        "message": "User declined handoff. No forks or code modifications will occur.",
        "authorized": False,
    }


confirm_opt_in_tool = FunctionTool(func=confirm_handoff_opt_in)

COORDINATOR_INSTRUCTION = """You are the flux AI Assistant, built with Google ADK.
You help software developers onboard quickly to code repositories, explore AST dependency graphs,
and autonomously resolve GitHub issues.

You have three specialized sub-agents:
1. summarizer_agent: Generates high-level repository architecture summaries, AST analysis,
   and Louvain community clusters.
2. issue_explainer_agent: Analyzes a GitHub issue against the repository graph digest and
   identifies relevant files and root causes.
3. orchestrator_agent: The high-stakes agent that forks the repository, runs code resolution,
   evaluates diff complexity, and opens a Pull Request or produces a detailed plan.

CRITICAL POLICY:
- Always delegate repository structure queries to summarizer_agent.
- Always delegate issue triage to issue_explainer_agent.
- NEVER invoke or transfer to orchestrator_agent without explicit user opt-in confirmation.
  Use confirm_handoff_opt_in or ask the user for confirmation first.
- Once confirmed, transfer to orchestrator_agent to execute the handoff flow.
"""

root_agent = Agent(
    name="flux_root",
    description="flux Multi-Agent Assistant: Onboarding, Issue Triage, and Automated Handoff.",
    model=DEFAULT_CHEAP_MODEL,
    instruction=COORDINATOR_INSTRUCTION,
    sub_agents=[
        summarizer_agent,
        issue_explainer_agent,
        orchestrator_agent,
    ],
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
