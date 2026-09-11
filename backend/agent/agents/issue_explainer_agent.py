# Issue Explainer Agent definition for mapping GitHub issues against codebase architecture.

from google.adk import Agent
from ..config import DEFAULT_CHEAP_MODEL
from ..tools.github_tools import fetch_issue_tool
from ..tools.ingest_tools import build_graph_digest_tool

ISSUE_EXPLAINER_INSTRUCTION = """You are the flux Issue Explainer Agent.
Your role is to explain GitHub issues in the context of the repository architecture.
Fetch issue details and connect symptoms to specific files and symbols."""

issue_explainer_agent = Agent(
    name="issue_explainer_agent",
    description="Fetches GitHub issues and maps them against repository architecture to identify affected files.",
    model=DEFAULT_CHEAP_MODEL,
    instruction=ISSUE_EXPLAINER_INSTRUCTION,
    tools=[fetch_issue_tool, build_graph_digest_tool],
)
